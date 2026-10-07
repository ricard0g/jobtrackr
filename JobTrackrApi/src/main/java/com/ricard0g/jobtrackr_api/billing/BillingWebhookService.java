package com.ricard0g.jobtrackr_api.billing;

import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class BillingWebhookService {
    private final BillingEventTransactions transactions;
    private final StripeGateway stripe;

    public void process(final StripeWebhookVerifier.VerifiedEvent event) {
        final BillingEventTransactions.DuplicatePurchase duplicate = transactions.process(event);
        if (duplicate == null || duplicate.completed()) {
            return;
        }
        final String outcome = stripe.reverseDuplicate(duplicate.checkoutId(), duplicate.subscriptionId(),
                duplicate.invoiceId());
        transactions.completeDuplicate(duplicate, outcome);
    }
}
