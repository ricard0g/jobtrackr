package com.ricard0g.jobtrackr_api.billing;

import java.time.Clock;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CheckoutService {
    private static final String STRIPE_SESSION_EXPIRED = "expired";
    private static final String STRIPE_SESSION_COMPLETE = "complete";
    private final StripeProperties properties;
    private final BillingTransactions transactions;
    private final StripeGateway stripe;
    private final ObjectProvider<Clock> clocks;

    public CheckoutResponse start(final UUID requestId) {
        properties.requireEnabled();
        return start(transactions.reserve(requestId));
    }

    public CheckoutResponse resubscribe(final UUID requestId, final UUID userId) {
        properties.requireEnabled();
        transactions.openResubscription(userId).ifPresent(this::expireIfConfirmed);
        return start(transactions.reserveResubscription(requestId, userId));
    }

    private CheckoutResponse start(final BillingRepository.Checkout checkout) {
        if (checkout.state() == CheckoutState.OPEN) {
            if (expireIfConfirmed(checkout)) {
                throw BillingException.expired();
            }
            return response(checkout);
        }
        final StripeGateway.CheckoutSession session = checkout.returningUserId() == null
                ? stripe.createCheckout(checkout.id(), checkout.returnToken())
                : stripe.createResubscriptionCheckout(checkout.id(), checkout.stripeCustomerId());
        return response(transactions.attach(checkout, session));
    }

    private boolean expireIfConfirmed(final BillingRepository.Checkout checkout) {
        final boolean deadlinePassed = !checkout.sessionExpiresAt()
                .isAfter(clocks.getIfAvailable(Clock::systemUTC).instant());
        if (!deadlinePassed) {
            return false;
        }
        final StripeGateway.Purchase purchase = stripe.retrievePurchase(checkout.sessionId());
        if (STRIPE_SESSION_EXPIRED.equals(purchase.sessionStatus())) {
            transactions.expire(checkout);
            return true;
        }
        if (STRIPE_SESSION_COMPLETE.equals(purchase.sessionStatus())) {
            throw checkout.returningUserId() == null ? BillingException.conflict()
                    : BillingException.resubscriptionConflict();
        }
        return false;
    }

    private CheckoutResponse response(final BillingRepository.Checkout checkout) {
        return new CheckoutResponse(checkout.url(), checkout.returnToken());
    }

    public record CheckoutResponse(String url, String checkoutToken) { }
}
