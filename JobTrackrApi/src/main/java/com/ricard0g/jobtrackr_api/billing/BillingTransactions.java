package com.ricard0g.jobtrackr_api.billing;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
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
        if (checkout.returningUserId() != null) {
            throw BillingException.conflict();
        }
        return validateRetry(checkout);
    }

    @Transactional
    public BillingRepository.Checkout reserveResubscription(final UUID requestId, final UUID userId) {
        final BillingRepository.Customer customer = repository.customerForUser(userId)
                .orElseThrow(BillingException::customerRequired);
        repository.lockCustomer(customer.id());
        if (repository.hasLiveSubscription(customer.id())) {
            throw BillingException.resubscriptionConflict();
        }
        return validateRetry(repository.reserveResubscription(requestId, userId, customer));
    }

    @Transactional(readOnly = true)
    public Optional<BillingRepository.Checkout> openResubscription(final UUID userId) {
        return repository.openResubscription(userId);
    }

    @Transactional(readOnly = true)
    public SubscriptionStatus subscriptionStatus(final UUID userId) {
        final boolean canResubscribe = repository.customerForUser(userId)
                .map(customer -> !repository.hasLiveSubscription(customer.id())).orElse(false);
        return new SubscriptionStatus(canResubscribe);
    }

    public record SubscriptionStatus(boolean canResubscribe) { }

    private BillingRepository.Checkout validateRetry(final BillingRepository.Checkout checkout) {
        final boolean unsafeRetry = checkout.state() == CheckoutState.PENDING
                && checkout.createdAt().plus(SAFE_IDEMPOTENCY_WINDOW).isBefore(Instant.now());
        final boolean endedResubscription = checkout.returningUserId() != null
                && (checkout.state() == CheckoutState.ENDED || checkout.state() == CheckoutState.DUPLICATE);
        final boolean expiredCheckout = checkout.state() == CheckoutState.EXPIRED || endedResubscription;
        if (expiredCheckout) {
            throw BillingException.expired();
        }
        final boolean existingPurchase = checkout.state() == CheckoutState.PAID
                || checkout.state() == CheckoutState.ENDED
                || checkout.state() == CheckoutState.DUPLICATE;
        final boolean unavailablePurchase = existingPurchase || unsafeRetry;
        if (unavailablePurchase) {
            throw checkout.returningUserId() == null ? BillingException.conflict()
                    : BillingException.resubscriptionConflict();
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
