package com.ricard0g.jobtrackr_api.billing;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class BillingRepository {
    private static final String CHECKOUT_SELECT = """
            SELECT c.*, b.stripe_customer_id FROM billing_checkouts c
            LEFT JOIN billing_customers b ON b.id = c.customer_id
            """;
    private final JdbcClient jdbc;

    public void lockCheckout(final UUID id) {
        jdbc.sql("SELECT id FROM billing_checkouts WHERE id = :id FOR UPDATE")
                .param("id", id).query(UUID.class).single();
    }

    public Checkout reserve(final UUID requestId) {
        final String token = UUID.randomUUID().toString() + UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO billing_checkouts (id, return_token) VALUES (:id, :token) ON CONFLICT (id) DO NOTHING
                """).param("id", requestId).param("token", token).update();
        lockCheckout(requestId);
        return checkout(requestId).orElseThrow();
    }

    public Optional<Checkout> checkout(final UUID id) {
        return jdbc.sql(CHECKOUT_SELECT + " WHERE c.id = :id").param("id", id).query(this::mapCheckout).optional();
    }

    public Optional<Checkout> byToken(final String token) {
        return jdbc.sql(CHECKOUT_SELECT + " WHERE c.return_token = :token")
                .param("token", token).query(this::mapCheckout).optional();
    }

    public void expire(final UUID id) {
        jdbc.sql("UPDATE billing_checkouts SET state = 'EXPIRED' WHERE id = :id AND state = 'OPEN'")
                .param("id", id).update();
    }

    public void attach(final Checkout checkout, final StripeGateway.CheckoutSession session) {
        jdbc.sql("""
                UPDATE billing_checkouts SET stripe_session_id = :stripe, checkout_url = :url,
                    session_expires_at = :expires, state = 'OPEN' WHERE id = :id AND state = 'PENDING'
                """).param("stripe", session.id()).param("url", session.url())
                .param("expires", java.sql.Timestamp.from(session.expiresAt())).param("id", checkout.id()).update();
    }

    public UUID bindCustomer(final Checkout checkout, final StripeGateway.Purchase purchase) {
        final String email = purchase.email().trim().toLowerCase(java.util.Locale.ROOT);
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:email, 0))")
                .param("email", email).query((row, index) -> true).single();
        jdbc.sql("""
                INSERT INTO billing_customers (id, checkout_email, stripe_customer_id)
                VALUES (:id, :email, :stripe) ON CONFLICT (stripe_customer_id) DO NOTHING
                """).param("id", UUID.randomUUID()).param("email", email)
                .param("stripe", purchase.customerId()).update();
        final UUID customerId = jdbc.sql("SELECT id FROM billing_customers WHERE stripe_customer_id = :stripe")
                .param("stripe", purchase.customerId()).query(UUID.class).single();
        jdbc.sql("UPDATE billing_checkouts SET customer_id = :customer, checkout_email = :email WHERE id = :id")
                .param("customer", customerId).param("email", email).param("id", checkout.id()).update();
        return customerId;
    }

    public boolean hasAnotherPurchase(final Checkout checkout, final StripeGateway.Purchase purchase) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM billing_checkouts WHERE id <> :id AND state = 'PAID'
                    AND (checkout_email = CAST(:email AS citext) OR customer_id = :customer))
                """).param("id", checkout.id()).param("email", purchase.email())
                .param("customer", checkout.customerId()).query(Boolean.class).single();
    }

    public Optional<Checkout> bySession(final String sessionId) {
        return jdbc.sql(CHECKOUT_SELECT + " WHERE c.stripe_session_id = :session")
                .param("session", sessionId).query(this::mapCheckout).optional();
    }

    public void markDuplicate(final Checkout checkout, final StripeGateway.Purchase purchase) {
        recordSubscription(checkout, purchase);
        jdbc.sql("UPDATE billing_checkouts SET state = 'DUPLICATE' WHERE id = :id")
                .param("id", checkout.id()).update();
        final StripeGateway.InitialInvoice initialInvoice = purchase.initialInvoice();
        jdbc.sql("""
                INSERT INTO billing_duplicates (checkout_id, stripe_subscription_id, stripe_invoice_id)
                VALUES (:id, :subscription, :invoice) ON CONFLICT DO NOTHING
                """).param("id", checkout.id()).param("subscription", purchase.subscriptionId())
                .param("invoice", initialInvoice.id()).update();
        recordPayment(checkout.id(), initialInvoice.id(), "duplicate_pending", initialInvoice.periodStart(),
                initialInvoice.periodEnd());
    }

    public BillingEventTransactions.DuplicatePurchase duplicate(final UUID checkoutId) {
        return jdbc.sql("SELECT * FROM billing_duplicates WHERE checkout_id = :id")
                .param("id", checkoutId).query((row, index) -> new BillingEventTransactions.DuplicatePurchase(
                        checkoutId, row.getString("stripe_subscription_id"), row.getString("stripe_invoice_id"),
                        row.getBoolean("completed"))).single();
    }

    public void reopenDuplicate(final UUID checkoutId) {
        jdbc.sql("UPDATE billing_duplicates SET completed = false WHERE checkout_id = :id")
                .param("id", checkoutId).update();
    }

    public void completeDuplicate(final UUID checkoutId, final String outcome) {
        jdbc.sql("UPDATE billing_subscriptions SET status = 'canceled' WHERE checkout_id = :id")
                .param("id", checkoutId).update();
        final boolean completed = "duplicate_refunded".equals(outcome) || "duplicate_cancelled".equals(outcome);
        jdbc.sql("UPDATE billing_duplicates SET completed = :completed WHERE checkout_id = :id")
                .param("completed", completed).param("id", checkoutId).update();
        jdbc.sql("""
                UPDATE billing_payments SET outcome = :outcome, updated_at = now()
                WHERE stripe_invoice_id = (SELECT stripe_invoice_id FROM billing_duplicates WHERE checkout_id = :id)
                """)
                .param("id", checkoutId).param("outcome", outcome).update();
    }

    public boolean recordEvent(final String eventId, final String type) {
        return jdbc.sql("INSERT INTO billing_events (stripe_event_id, event_type) VALUES (:id, :type) "
                + "ON CONFLICT DO NOTHING").param("id", eventId).param("type", type).update() == 1;
    }

    public void reconcile(final Checkout checkout, final StripeGateway.Purchase purchase, final boolean paid) {
        if (purchase.subscriptionId() != null) {
            recordSubscription(checkout, purchase);
        }
        if (purchase.invoiceId() != null) {
            recordPayment(checkout.id(), purchase.invoiceId(), purchase.paymentStatus(), purchase.periodStart(),
                    purchase.periodEnd());
        }
        final boolean ended = "canceled".equals(purchase.subscriptionStatus())
                || "incomplete_expired".equals(purchase.subscriptionStatus());
        final boolean initialPaymentConfirmed = purchase.subscriptionId() != null
                && "paid".equals(purchase.checkoutPaymentStatus()) && "complete".equals(purchase.sessionStatus());
        final CheckoutState state = "expired".equals(purchase.sessionStatus()) ? CheckoutState.EXPIRED
                : ended ? CheckoutState.ENDED
                : initialPaymentConfirmed ? CheckoutState.PAID : CheckoutState.OPEN;
        jdbc.sql("UPDATE billing_checkouts SET state = :state WHERE id = :id")
                .param("state", state.name()).param("id", checkout.id()).update();
        if (paid) {
            jdbc.sql("""
                    INSERT INTO registration_claims (id, checkout_id, paid_period_start, expires_at)
                    VALUES (:id, :checkout, :start, :end) ON CONFLICT (checkout_id) DO NOTHING
                    """).param("id", UUID.randomUUID()).param("checkout", checkout.id())
                    .param("start", timestamp(purchase.periodStart())).param("end", timestamp(purchase.periodEnd()))
                    .update();
        }
    }

    private void recordSubscription(final Checkout checkout, final StripeGateway.Purchase purchase) {
        jdbc.sql("""
                INSERT INTO billing_subscriptions
                    (stripe_subscription_id, customer_id, checkout_id, status, period_start, period_end)
                VALUES (:stripe, :customer, :checkout, :status, :start, :end)
                ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = EXCLUDED.status,
                    period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end
                """).param("stripe", purchase.subscriptionId()).param("customer", checkout.customerId())
                .param("checkout", checkout.id()).param("status", purchase.subscriptionStatus())
                .param("start", timestamp(purchase.periodStart())).param("end", timestamp(purchase.periodEnd()))
                .update();
    }

    public void recordPayment(final UUID checkoutId, final String invoiceId, final String outcome,
                              final Instant start, final Instant end) {
        jdbc.sql("""
                INSERT INTO billing_payments (stripe_invoice_id, checkout_id, outcome, period_start, period_end)
                VALUES (:id, :checkout, :outcome, :start, :end)
                ON CONFLICT (stripe_invoice_id) DO UPDATE SET outcome = EXCLUDED.outcome, updated_at = now()
                """).param("id", invoiceId).param("checkout", checkoutId).param("outcome", outcome)
                .param("start", timestamp(start)).param("end", timestamp(end)).update();
    }

    public ClaimStatus claimStatus(final String token) {
        return jdbc.sql("""
                SELECT r.id, r.paid_period_start, r.expires_at,
                    (r.consumed_at IS NULL AND r.expires_at > now() AND c.state = 'PAID'
                        AND s.status = 'active' AND EXISTS (SELECT 1 FROM billing_payments p
                            WHERE p.checkout_id = c.id AND p.outcome = 'paid'
                                AND p.period_start = r.paid_period_start AND p.period_end = r.expires_at)) AS eligible,
                    c.state = 'DUPLICATE' AS duplicate
                FROM billing_checkouts c
                LEFT JOIN registration_claims r ON r.checkout_id = c.id
                LEFT JOIN billing_subscriptions s ON s.checkout_id = c.id
                WHERE c.return_token = :token
                """).param("token", token).query((row, index) -> new ClaimStatus(row.getBoolean("eligible"),
                        row.getTimestamp("paid_period_start") == null ? null
                                : row.getTimestamp("paid_period_start").toInstant(),
                        row.getTimestamp("expires_at") == null ? null : row.getTimestamp("expires_at").toInstant(),
                        row.getBoolean("duplicate")))
                .optional().orElseThrow(() -> new BillingException(org.springframework.http.HttpStatus.NOT_FOUND,
                        "CHECKOUT_NOT_FOUND", "Checkout was not found."));
    }

    public Optional<String> stripeCustomerForUser(final UUID userId) {
        return jdbc.sql("SELECT stripe_customer_id FROM billing_customers WHERE user_id = :user")
                .param("user", userId).query(String.class).optional();
    }

    public Optional<Instant> paidUntil(final UUID userId, final Instant now) {
        return jdbc.sql("""
                SELECT s.period_end FROM billing_subscriptions s
                JOIN billing_customers b ON b.id = s.customer_id
                JOIN billing_checkouts c ON c.id = s.checkout_id
                WHERE b.user_id = :user AND c.state = 'PAID' AND s.status = 'active'
                    AND s.period_start <= :now AND s.period_end > :now
                    AND EXISTS (SELECT 1 FROM billing_payments p WHERE p.checkout_id = s.checkout_id
                        AND p.outcome = 'paid' AND p.period_start = s.period_start AND p.period_end = s.period_end)
                ORDER BY s.period_end DESC LIMIT 1
                """).param("user", userId).param("now", timestamp(now.truncatedTo(ChronoUnit.MICROS)))
                .query((row, index) -> row.getTimestamp("period_end").toInstant()).optional();
    }

    private java.sql.Timestamp timestamp(final Instant instant) {
        return instant == null ? null : java.sql.Timestamp.from(instant);
    }

    public record ClaimStatus(boolean registrationEligible, Instant paidPeriodStart, Instant expiresAt,
                              boolean duplicate) { }

    private Checkout mapCheckout(final ResultSet row, final int index) throws SQLException {
        return new Checkout(row.getObject("id", UUID.class), row.getObject("customer_id", UUID.class),
                row.getString("checkout_email"), row.getString("stripe_customer_id"), row.getString("return_token"),
                row.getString("stripe_session_id"), row.getString("checkout_url"),
                CheckoutState.valueOf(row.getString("state")),
                row.getTimestamp("created_at").toInstant(),
                row.getTimestamp("session_expires_at") == null ? null
                        : row.getTimestamp("session_expires_at").toInstant());
    }

    public record Checkout(UUID id, UUID customerId, String email, String stripeCustomerId, String returnToken,
                           String sessionId, String url, CheckoutState state, Instant createdAt,
                           Instant sessionExpiresAt) { }
}
