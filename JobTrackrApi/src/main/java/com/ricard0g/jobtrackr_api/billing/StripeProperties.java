package com.ricard0g.jobtrackr_api.billing;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jobtrackr.stripe")
public record StripeProperties(boolean enabled, String secretKey, String webhookSecret, String weeklyPriceId,
                               String landingOrigin) {
    public void requireEnabled() {
        if (!enabled) {
            throw BillingException.unavailable();
        }
    }

    public void validate() {
        if (!enabled) {
            return;
        }
        final boolean missingCredentials = secretKey == null || secretKey.isBlank()
                || webhookSecret == null || webhookSecret.isBlank() || weeklyPriceId == null || weeklyPriceId.isBlank();
        if (missingCredentials) {
            throw new IllegalStateException(
                    "Stripe requires STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_WEEKLY_PRICE_ID");
        }
        final URI origin = URI.create(landingOrigin);
        final boolean validOrigin = origin.getHost() != null && origin.getRawQuery() == null
                && origin.getRawFragment() == null && origin.getUserInfo() == null
                && (origin.getPath().isEmpty() || origin.getPath().equals("/"))
                && ("https".equals(origin.getScheme()) || ("http".equals(origin.getScheme())
                && ("localhost".equals(origin.getHost()) || "127.0.0.1".equals(origin.getHost()))));
        if (!validOrigin) {
            throw new IllegalStateException(
                    "STRIPE_LANDING_ORIGIN must be an HTTPS origin (HTTP allowed on localhost)");
        }
    }
}
