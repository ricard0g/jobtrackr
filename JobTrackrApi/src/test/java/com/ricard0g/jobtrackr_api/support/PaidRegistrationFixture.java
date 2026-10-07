package com.ricard0g.jobtrackr_api.support;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;

import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.registration.RegistrationService;

public final class PaidRegistrationFixture {
    private PaidRegistrationFixture() {
        throw new UnsupportedOperationException();
    }

    public static String withVerifiedPurchase(final JdbcClient jdbc, final String registrationJson) {
        final String email = ((String) JsonPath.read(registrationJson, "$.email")).trim()
                .toLowerCase(java.util.Locale.ROOT);
        final String token = "fixture-verified-" + email.toLowerCase(java.util.Locale.ROOT);
        final boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM billing_checkouts "
                + "WHERE checkout_email = CAST(:email AS citext))")
                .param("email", email).query(Boolean.class).single();
        if (!exists) {
            final UUID customer = UUID.randomUUID();
            final UUID checkout = UUID.randomUUID();
            final UUID claim = UUID.randomUUID();
            jdbc.sql("""
                    INSERT INTO billing_customers (id, checkout_email, stripe_customer_id)
                    VALUES (:id, :email, :stripe)
                    """)
                    .param("id", customer).param("email", email).param("stripe", "cus_" + customer).update();
            jdbc.sql("""
                    INSERT INTO billing_checkouts (id, customer_id, checkout_email, return_token, state)
                    VALUES (:id, :customer, :email, :token, 'PAID')
                    """).param("id", checkout).param("customer", customer).param("email", email)
                    .param("token", UUID.randomUUID().toString()).update();
            jdbc.sql("""
                    INSERT INTO billing_subscriptions (stripe_subscription_id, customer_id, checkout_id,
                        status, period_start, period_end)
                    VALUES (:stripe, :customer, :checkout, 'active', '2020-01-01T00:00:00Z', '2100-01-01T00:00:00Z')
                    """).param("stripe", "sub_" + checkout).param("customer", customer).param("checkout", checkout)
                    .update();
            jdbc.sql("""
                    INSERT INTO billing_payments (stripe_invoice_id, checkout_id, outcome, period_start, period_end)
                    VALUES (:stripe, :checkout, 'paid', '2020-01-01T00:00:00Z', '2100-01-01T00:00:00Z')
                    """).param("stripe", "in_" + checkout).param("checkout", checkout)
                    .update();
            jdbc.sql("""
                    INSERT INTO registration_claims (id, checkout_id, paid_period_start, expires_at)
                    VALUES (:id, :checkout, '2020-01-01T00:00:00Z', '2100-01-01T00:00:00Z')
                    """).param("id", claim).param("checkout", checkout)
                    .update();
            jdbc.sql("""
                    INSERT INTO registration_email_verifications (token_hash, claim_id, checkout_email, expires_at)
                    VALUES (:hash, :claim, :email, '2100-01-01T00:00:00Z')
                    """).param("hash", RegistrationService.hash(token)).param("claim", claim).param("email", email)
                    .update();
        }
        return JsonPath.parse(registrationJson).put("$", "verificationToken", token).jsonString();
    }
}
