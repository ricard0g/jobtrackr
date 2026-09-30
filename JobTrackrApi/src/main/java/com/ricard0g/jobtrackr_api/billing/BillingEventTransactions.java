package com.ricard0g.jobtrackr_api.billing;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class BillingEventTransactions {
    private static final Set<String> CHECKOUT_EVENTS = Set.of("checkout.session.completed",
            "checkout.session.expired", "checkout.session.async_payment_failed");
    private static final Set<String> INVOICE_EVENTS = Set.of("invoice.paid", "invoice.payment_failed");
    private static final Set<String> SUBSCRIPTION_EVENTS = Set.of("customer.subscription.updated",
            "customer.subscription.deleted");
    private static final Set<String> REFUND_EVENTS = Set.of("refund.updated", "refund.failed");
    private final BillingRepository repository;
    private final StripeGateway stripe;
    private final StripeProperties properties;

    @Transactional
    public DuplicatePurchase process(final StripeWebhookVerifier.VerifiedEvent event) {
        final boolean newEvent = repository.recordEvent(event.id(), event.type());
        BillingRepository.Checkout checkout = findCheckout(event);
        if (checkout == null) {
            return null;
        }
        repository.lockCheckout(checkout.id());
        checkout = repository.checkout(checkout.id()).orElseThrow();
        if (checkout.state() == CheckoutState.DUPLICATE) {
            final boolean changedRefund = newEvent && REFUND_EVENTS.contains(event.type());
            if (changedRefund) {
                repository.reopenDuplicate(checkout.id());
            }
            return repository.duplicate(checkout.id());
        }
        if (!newEvent) {
            return null;
        }
        if (checkout.sessionId() == null) {
            throw BillingException.unavailable();
        }
        final StripeGateway.Purchase purchase = stripe.retrievePurchase(checkout.sessionId());
        final boolean matchingPurchase = checkout.sessionId().equals(purchase.sessionId())
                && (purchase.subscriptionId() == null || (purchase.customerId() != null
                && purchase.email() != null && !purchase.email().isBlank()
                && properties.weeklyPriceId().equals(purchase.priceId())));
        if (!matchingPurchase) {
            throw new BillingException(HttpStatus.BAD_REQUEST, "STRIPE_PURCHASE_MISMATCH",
                    "Stripe purchase does not match the reserved Checkout.");
        }
        if (purchase.subscriptionId() != null) {
            repository.bindCustomer(checkout, purchase);
            checkout = repository.checkout(checkout.id()).orElseThrow();
            if (repository.hasAnotherPurchase(checkout, purchase)) {
                repository.markDuplicate(checkout, purchase);
                return repository.duplicate(checkout.id());
            }
        }
        final boolean paid = "paid".equals(purchase.paymentStatus())
                && "complete".equals(purchase.sessionStatus()) && "active".equals(purchase.subscriptionStatus())
                && purchase.periodStart() != null && purchase.periodEnd() != null
                && purchase.periodStart().isBefore(purchase.periodEnd()) && purchase.periodEnd().isAfter(Instant.now());
        repository.reconcile(checkout, purchase, paid);
        return null;
    }

    @Transactional
    public void completeDuplicate(final DuplicatePurchase duplicate, final String outcome) {
        repository.completeDuplicate(duplicate.checkoutId(), outcome);
    }

    public record DuplicatePurchase(UUID checkoutId, String subscriptionId, String invoiceId, boolean completed) { }

    private BillingRepository.Checkout findCheckout(final StripeWebhookVerifier.VerifiedEvent event) {
        if (CHECKOUT_EVENTS.contains(event.type())) {
            final BillingRepository.Checkout checkout = repository.bySession(event.object().get("id").asString())
                    .orElse(null);
            if (checkout != null) {
                return checkout;
            }
            return fromMetadata(event.object(), "client_reference_id");
        }
        if (REFUND_EVENTS.contains(event.type())) {
            return fromMetadata(event.object().path("metadata"), "checkout_id");
        }
        if (SUBSCRIPTION_EVENTS.contains(event.type())) {
            return fromMetadata(event.object().path("metadata"), "checkout_id");
        }
        if (INVOICE_EVENTS.contains(event.type())) {
            final JsonNode parent = event.object().path("parent");
            if (parent.has("subscription_details")) {
                return fromMetadata(parent.path("subscription_details").path("metadata"),
                        "checkout_id");
            }
            final JsonNode details = event.object().path("subscription_details");
            return fromMetadata(details.path("metadata"), "checkout_id");
        }
        return null;
    }

    private BillingRepository.Checkout fromMetadata(final JsonNode metadata, final String key) {
        final boolean missingReference = !metadata.isObject() || !metadata.hasNonNull(key);
        if (missingReference) {
            return null;
        }
        try {
            return repository.checkout(UUID.fromString(metadata.get(key).asString())).orElse(null);
        } catch (final IllegalArgumentException exception) {
            return null;
        }
    }
}
