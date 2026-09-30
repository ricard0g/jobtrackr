package com.ricard0g.jobtrackr_api.billing;

import java.util.UUID;
import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CheckoutService {
    private final StripeProperties properties;
    private final BillingTransactions transactions;
    private final StripeGateway stripe;

    public CheckoutResponse start(final UUID requestId) {
        properties.requireEnabled();
        final BillingRepository.Checkout checkout = transactions.reserve(requestId);
        if (checkout.state() == CheckoutState.OPEN) {
            final boolean deadlinePassed = checkout.sessionExpiresAt().isBefore(java.time.Instant.now());
            if (deadlinePassed) {
                final StripeGateway.Purchase purchase = stripe.retrievePurchase(checkout.sessionId());
                if ("expired".equals(purchase.sessionStatus())) {
                    transactions.expire(checkout);
                    throw BillingException.expired();
                }
                if ("complete".equals(purchase.sessionStatus())) {
                    throw BillingException.conflict();
                }
            }
            return response(checkout);
        }
        final StripeGateway.CheckoutSession session = stripe.createCheckout(checkout.id(), checkout.returnToken());
        return response(transactions.attach(checkout, session));
    }

    private CheckoutResponse response(final BillingRepository.Checkout checkout) {
        return new CheckoutResponse(checkout.url(), checkout.returnToken());
    }

    public record CheckoutResponse(String url, String checkoutToken) { }
}
