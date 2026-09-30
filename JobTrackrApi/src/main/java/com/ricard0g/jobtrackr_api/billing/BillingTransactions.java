package com.ricard0g.jobtrackr_api.billing;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class BillingTransactions {
    private static final Duration SAFE_IDEMPOTENCY_WINDOW = Duration.ofHours(23);
    private final BillingRepository repository;

    @Transactional
    public BillingRepository.Checkout reserve(final UUID requestId) {
        final BillingRepository.Checkout checkout = repository.reserve(requestId);
        final boolean unsafeRetry = checkout.state() == CheckoutState.PENDING
                && checkout.createdAt().plus(SAFE_IDEMPOTENCY_WINDOW).isBefore(Instant.now());
        if (checkout.state() == CheckoutState.EXPIRED) {
            throw BillingException.expired();
        }
        final boolean existingPurchase = checkout.state() == CheckoutState.PAID
                || checkout.state() == CheckoutState.ENDED
                || checkout.state() == CheckoutState.DUPLICATE;
        final boolean unavailablePurchase = existingPurchase || unsafeRetry;
        if (unavailablePurchase) {
            throw BillingException.conflict();
        }
        return checkout;
    }

    @Transactional
    public void expire(final BillingRepository.Checkout checkout) {
        repository.lockCheckout(checkout.id());
        repository.expire(checkout.id());
    }

    @Transactional
    public BillingRepository.Checkout attach(final BillingRepository.Checkout checkout,
                                              final StripeGateway.CheckoutSession session) {
        repository.lockCheckout(checkout.id());
        repository.attach(checkout, session);
        return repository.checkout(checkout.id()).orElseThrow();
    }
}
