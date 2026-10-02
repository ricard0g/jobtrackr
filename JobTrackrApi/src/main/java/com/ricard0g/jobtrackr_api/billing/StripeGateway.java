package com.ricard0g.jobtrackr_api.billing;

import java.time.Instant;
import java.util.UUID;

public interface StripeGateway {
    CheckoutSession createCheckout(UUID checkoutId, String returnToken);

    Purchase retrievePurchase(String sessionId);

    String reverseDuplicate(UUID checkoutId, String subscriptionId, String invoiceId);

    record CheckoutSession(String id, String url, Instant expiresAt) { }

    record Purchase(String sessionId, String customerId, String email, String subscriptionId,
                    String subscriptionStatus, String invoiceId, String paymentStatus, String priceId,
                    Instant periodStart, Instant periodEnd, String sessionStatus, String checkoutPaymentStatus,
                    InitialInvoice initialInvoice) { }

    record InitialInvoice(String id, Instant periodStart, Instant periodEnd) { }
}
