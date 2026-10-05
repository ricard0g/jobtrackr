package com.ricard0g.jobtrackr_api.billing;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import com.stripe.exception.StripeException;
import com.stripe.model.Invoice;
import com.stripe.model.InvoiceLineItem;
import com.stripe.model.InvoicePayment;
import com.stripe.model.Refund;
import com.stripe.model.Price;
import com.stripe.model.Subscription;
import com.stripe.model.SubscriptionItem;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class StripeApiGateway implements StripeGateway {
    private static final long WEEKLY_AMOUNT_CENTS = 1099L;
    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 10000;
    private static final int NETWORK_RETRIES = 2;
    private final StripeProperties properties;

    @Override
    public CheckoutSession createCheckout(final UUID checkoutId, final String returnToken) {
        final String origin = properties.landingOrigin().replaceAll("/$", "");
        return createCheckout(checkoutId, null, origin + "/checkout-return/#" + returnToken,
                origin + "/#pricing-section");
    }

    @Override
    public CheckoutSession createResubscriptionCheckout(final UUID checkoutId, final String customerId) {
        final String origin = properties.appOrigin().replaceAll("/$", "");
        return createCheckout(checkoutId, customerId, origin + "/settings/account?resubscribe=returned",
                origin + "/settings/account");
    }

    private CheckoutSession createCheckout(final UUID checkoutId, final String customerId,
                                           final String successUrl, final String cancelUrl) {
        properties.requireEnabled();
        try {
            validatePrice();
            final Map<String, Object> parameters = new HashMap<>(Map.of(
                    "mode", "subscription",
                    "client_reference_id", checkoutId.toString(),
                    "subscription_data", Map.of("metadata", Map.of("checkout_id", checkoutId.toString())),
                    "payment_method_types", List.of("card"),
                    "line_items", List.of(Map.of("price", properties.weeklyPriceId(), "quantity", 1)),
                    "automatic_tax", Map.of("enabled", true),
                    "success_url", successUrl,
                    "cancel_url", cancelUrl
            ));
            if (customerId != null) {
                parameters.put("customer", customerId);
                parameters.put("customer_update", Map.of("address", "auto"));
            }
            final Session session = Session.create(parameters, options("checkout-" + checkoutId));
            return new CheckoutSession(session.getId(), session.getUrl(),
                    Instant.ofEpochSecond(session.getExpiresAt()));
        } catch (final StripeException exception) {
            throw BillingException.unavailable();
        }
    }

    @Override
    public Purchase retrievePurchase(final String sessionId) {
        properties.requireEnabled();
        try {
            final Session session = Session.retrieve(sessionId, options(null));
            if (session.getSubscription() == null) {
                return new Purchase(session.getId(), session.getCustomer(), session.getCustomerEmail(), null,
                        null, null, session.getPaymentStatus(), null, null, null, session.getStatus(),
                        session.getPaymentStatus(), null);
            }
            final Subscription subscription = Subscription.retrieve(session.getSubscription(), options(null));
            if (subscription.getLatestInvoice() == null) {
                throw BillingException.unavailable();
            }
            final Invoice invoice = Invoice.retrieve(subscription.getLatestInvoice(), options(null));
            final SubscriptionItem item = subscription.getItems().getData().getFirst();
            final InvoiceLineItem.Period period = invoice.getLines().getData().getFirst().getPeriod();
            final String email = session.getCustomerDetails().getEmail();
            return new Purchase(session.getId(), subscription.getCustomer(), email, subscription.getId(),
                    subscription.getStatus(), invoice.getId(), invoice.getStatus(), item.getPrice().getId(),
                    Instant.ofEpochSecond(period.getStart()),
                    Instant.ofEpochSecond(period.getEnd()), session.getStatus(), session.getPaymentStatus(),
                    initialInvoice(session, subscription, invoice));
        } catch (final StripeException exception) {
            throw BillingException.unavailable();
        }
    }

    @Override
    public String reverseDuplicate(final UUID checkoutId, final String subscriptionId, final String invoiceId) {
        properties.requireEnabled();
        try {
            final Subscription subscription = Subscription.retrieve(subscriptionId, options(null));
            if (!"canceled".equals(subscription.getStatus())) {
                subscription.cancel(Map.of("invoice_now", false, "prorate", false), options(null));
            }
            final Invoice invoice = Invoice.retrieve(invoiceId, options(null));
            if (invoice.getAmountPaid() == 0) {
                return "duplicate_cancelled";
            }
            final InvoicePayment payment = InvoicePayment.list(Map.of("invoice", invoiceId, "status", "paid"),
                    options(null)).getData().getFirst();
            final String paymentIntent = payment.getPayment().getPaymentIntent();
            long refundedAmount = 0;
            int failedRefunds = 0;
            boolean pending = false;
            for (final Refund refund : Refund.list(Map.of("payment_intent", paymentIntent), options(null))
                    .autoPagingIterable()) {
                final boolean counted = "succeeded".equals(refund.getStatus()) || "pending".equals(refund.getStatus());
                if (counted) {
                    refundedAmount += refund.getAmount();
                    pending = pending || "pending".equals(refund.getStatus());
                } else {
                    failedRefunds++;
                }
            }
            final long remaining = invoice.getAmountPaid() - refundedAmount;
            if (remaining > 0) {
                final Refund refund = Refund.create(Map.of("payment_intent", paymentIntent, "reason", "duplicate",
                        "amount", remaining, "metadata", Map.of("checkout_id", checkoutId.toString())),
                        options("duplicate-refund-" + checkoutId + "-" + remaining + "-" + failedRefunds));
                final boolean accepted = "succeeded".equals(refund.getStatus()) || "pending".equals(refund.getStatus());
                if (!accepted) {
                    throw BillingException.unavailable();
                }
                pending = pending || "pending".equals(refund.getStatus());
            }
            return pending ? "duplicate_refund_pending" : "duplicate_refunded";
        } catch (final StripeException exception) {
            throw BillingException.unavailable();
        }
    }

    private InitialInvoice initialInvoice(final Session session, final Subscription subscription,
                                          final Invoice currentInvoice) throws StripeException {
        String invoiceId = session.getInvoice();
        if (invoiceId == null) {
            for (final Invoice invoice : Invoice.list(Map.of("subscription", subscription.getId()), options(null))
                    .autoPagingIterable()) {
                if ("subscription_create".equals(invoice.getBillingReason())) {
                    invoiceId = invoice.getId();
                    break;
                }
            }
        }
        if (invoiceId == null) {
            throw BillingException.unavailable();
        }
        final Invoice invoice = invoiceId.equals(currentInvoice.getId()) ? currentInvoice
                : Invoice.retrieve(invoiceId, options(null));
        final InvoiceLineItem.Period period = invoice.getLines().getData().getFirst().getPeriod();
        return new InitialInvoice(invoice.getId(), Instant.ofEpochSecond(period.getStart()),
                Instant.ofEpochSecond(period.getEnd()));
    }

    private void validatePrice() throws StripeException {
        final Price price = Price.retrieve(properties.weeklyPriceId(), options(null));
        final Price.Recurring recurring = price.getRecurring();
        final boolean validOffer = Boolean.TRUE.equals(price.getActive()) && "eur".equals(price.getCurrency())
                && Long.valueOf(WEEKLY_AMOUNT_CENTS).equals(price.getUnitAmount())
                && "inclusive".equals(price.getTaxBehavior()) && recurring != null
                && "week".equals(recurring.getInterval()) && Long.valueOf(1).equals(recurring.getIntervalCount());
        if (!validOffer) {
            throw BillingException.unavailable();
        }
    }

    private RequestOptions options(final String key) {
        return RequestOptions.builder().setApiKey(properties.secretKey()).setIdempotencyKey(key)
                .setConnectTimeout(CONNECT_TIMEOUT_MS).setReadTimeout(READ_TIMEOUT_MS)
                .setMaxNetworkRetries(NETWORK_RETRIES).build();
    }
}
