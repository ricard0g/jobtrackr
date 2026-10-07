package com.ricard0g.jobtrackr_api.billing;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class BillingPortalService {
    private final BillingRepository repository;
    private final StripeGateway stripe;

    @Transactional(readOnly = true)
    public PortalResponse open(final UUID userId) {
        final String customerId = repository.stripeCustomerForUser(userId)
                .orElseThrow(BillingException::customerMissing);
        return new PortalResponse(stripe.createPortal(customerId));
    }

    public record PortalResponse(String url) { }
}
