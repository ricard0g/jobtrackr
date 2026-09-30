package com.ricard0g.jobtrackr_api.billing;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.net.Webhook;
import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class StripeWebhookVerifier {
    private final StripeProperties properties;
    private final JsonMapper json;

    public VerifiedEvent verify(final String body, final String signature) {
        properties.requireEnabled();
        try {
            Webhook.Signature.verifyHeader(body, signature, properties.webhookSecret(), Webhook.DEFAULT_TOLERANCE);
            final JsonNode event = json.readTree(body);
            final String id = event.path("id").asString("");
            final String type = event.path("type").asString("");
            final JsonNode object = event.path("data").path("object");
            final boolean invalidEvent = id.isBlank() || type.isBlank() || !object.isObject();
            if (invalidEvent) {
                throw new IllegalArgumentException("Malformed event");
            }
            return new VerifiedEvent(id, type, object);
        } catch (final SignatureVerificationException | RuntimeException exception) {
            throw new BillingException(HttpStatus.BAD_REQUEST, "INVALID_STRIPE_EVENT", "Invalid Stripe event.");
        }
    }

    public record VerifiedEvent(String id, String type, JsonNode object) { }
}
