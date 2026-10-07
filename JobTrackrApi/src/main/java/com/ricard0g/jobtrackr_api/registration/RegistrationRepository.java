package com.ricard0g.jobtrackr_api.registration;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.ricard0g.jobtrackr_api.billing.BillingRepository;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class RegistrationRepository {
    private static final String CLAIM_SELECT = """
            SELECT r.id, r.checkout_id, c.customer_id, c.checkout_email, r.expires_at
            FROM registration_claims r JOIN billing_checkouts c ON c.id = r.checkout_id
            """;
    private static final String ELIGIBLE = """
            r.consumed_at IS NULL AND r.expires_at > clock_timestamp()
            AND c.state = 'PAID' AND b.user_id IS NULL
            AND s.status = 'active' AND s.period_start <= clock_timestamp() AND s.period_end > clock_timestamp()
            AND EXISTS (SELECT 1 FROM billing_payments p WHERE p.checkout_id = c.id AND p.outcome = 'paid'
                AND p.period_start = s.period_start AND p.period_end = s.period_end)
            """;
    private final JdbcClient jdbc;
    private final BillingRepository billing;

    public Optional<Claim> lockEligibleByEmail(final String email) {
        final Optional<UUID> id = jdbc.sql("""
                SELECT r.id FROM registration_claims r
                    JOIN billing_checkouts c ON c.id = r.checkout_id
                    JOIN billing_customers b ON b.id = c.customer_id
                    JOIN billing_subscriptions s ON s.checkout_id = c.id
                WHERE c.checkout_email = CAST(:email AS citext) AND
                """ + ELIGIBLE).param("email", email).query(UUID.class).optional();
        if (id.isEmpty()) {
            return Optional.empty();
        }
        final Claim claim = lockClaim("r.id = CAST(:token AS uuid)", id.get().toString());
        return isEligible(claim.id()) ? Optional.of(claim) : Optional.empty();
    }

    public Claim lockByCheckoutToken(final String token) {
        final Claim claim = lockClaim("c.return_token = :token", token);
        requireEligible(claim.id());
        return claim;
    }

    public Claim lockByVerificationToken(final String hash) {
        final Claim claim = lockClaim("r.id = (SELECT claim_id FROM registration_email_verifications "
                + "WHERE token_hash = :token)", hash);
        requireEligible(claim.id());
        final boolean valid = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM registration_email_verifications v JOIN billing_checkouts c
                    ON c.id = :checkout WHERE v.token_hash = :hash AND v.claim_id = :claim
                    AND v.checkout_email = c.checkout_email AND v.expires_at > clock_timestamp())
                """).param("checkout", claim.checkoutId()).param("hash", hash).param("claim", claim.id())
                .query(Boolean.class).single();
        if (!valid) {
            throw RegistrationException.invalidClaim();
        }
        return claim;
    }

    public void storeVerification(final Claim claim, final String hash, final Instant expiresAt) {
        jdbc.sql("""
                INSERT INTO registration_email_verifications (token_hash, claim_id, checkout_email, expires_at)
                VALUES (:hash, :claim, :email, :expires)
                """).param("hash", hash).param("claim", claim.id()).param("email", claim.email())
                .param("expires", java.sql.Timestamp.from(expiresAt)).update();
    }

    public Claim lockById(final UUID claimId) {
        final Claim claim = lockClaim("r.id = CAST(:token AS uuid)", claimId.toString());
        requireEligible(claim.id());
        return claim;
    }

    public boolean isConsumed(final UUID claimId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM registration_claims WHERE id = :id AND consumed_at IS NOT NULL)")
                .param("id", claimId).query(Boolean.class).single();
    }

    public void consumeVerifiedAndLink(final Claim claim, final UUID userId, final String hash) {
        consumeAndLink(claim, userId, """
                AND EXISTS (SELECT 1 FROM registration_email_verifications v WHERE v.token_hash = :hash
                    AND v.claim_id = r.id AND v.checkout_email = c.checkout_email
                    AND v.expires_at > clock_timestamp())
                """, hash);
    }

    public void consumeAndLink(final Claim claim, final UUID userId) {
        consumeAndLink(claim, userId, "", null);
    }

    private void consumeAndLink(final Claim claim, final UUID userId, final String verification,
                                final String hash) {
        JdbcClient.StatementSpec update = jdbc.sql("""
                UPDATE registration_claims r SET consumed_at = clock_timestamp()
                FROM billing_checkouts c JOIN billing_customers b ON b.id = c.customer_id
                    JOIN billing_subscriptions s ON s.checkout_id = c.id
                WHERE r.checkout_id = c.id AND r.id = :id AND
                """ + ELIGIBLE + verification).param("id", claim.id());
        if (hash != null) {
            update = update.param("hash", hash);
        }
        if (update.update() != 1) {
            throw RegistrationException.invalidClaim();
        }
        final int linked = jdbc.sql("UPDATE billing_customers SET user_id = :user "
                + "WHERE id = :customer AND user_id IS NULL")
                .param("user", userId).param("customer", claim.customerId()).update();
        if (linked != 1) {
            throw RegistrationException.invalidClaim();
        }
    }

    private Claim findClaim(final String predicate, final String token) {
        return jdbc.sql(CLAIM_SELECT + " WHERE " + predicate).param("token", token)
                .query((row, index) -> new Claim(row.getObject("id", UUID.class),
                        row.getObject("checkout_id", UUID.class), row.getObject("customer_id", UUID.class),
                        row.getString("checkout_email"), row.getTimestamp("expires_at").toInstant()))
                .optional().orElseThrow(RegistrationException::invalidClaim);
    }

    private Claim lockClaim(final String predicate, final String token) {
        final Claim initial = findClaim(predicate, token);
        billing.lockCheckout(initial.checkoutId());
        final Claim claim = findClaim(predicate, token);
        jdbc.sql("SELECT id FROM billing_customers WHERE id = :id FOR UPDATE")
                .param("id", claim.customerId()).query(UUID.class).single();
        return claim;
    }

    private void requireEligible(final UUID claimId) {
        if (!isEligible(claimId)) {
            throw RegistrationException.invalidClaim();
        }
    }

    private boolean isEligible(final UUID claimId) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM registration_claims r
                    JOIN billing_checkouts c ON c.id = r.checkout_id
                    JOIN billing_customers b ON b.id = c.customer_id
                    JOIN billing_subscriptions s ON s.checkout_id = c.id
                    WHERE r.id = :id AND
                """ + ELIGIBLE + ")").param("id", claimId).query(Boolean.class).single();
    }

    public record Claim(UUID id, UUID checkoutId, UUID customerId, String email, Instant expiresAt) { }
}
