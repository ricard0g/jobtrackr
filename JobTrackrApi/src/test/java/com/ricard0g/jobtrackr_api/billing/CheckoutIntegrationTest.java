package com.ricard0g.jobtrackr_api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "jwt.signing-key=test-signing-key-with-at-least-32-characters",
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket",
        "jobtrackr.stripe.enabled=true",
        "jobtrackr.stripe.secret-key=sk_test_fake",
        "jobtrackr.stripe.webhook-secret=whsec_test",
        "jobtrackr.stripe.weekly-price-id=price_weekly",
        "jobtrackr.stripe.landing-origin=http://localhost:4321"
})
class CheckoutIntegrationTest {
    private static final String CHECKOUTS = "/api/v1/billing/checkouts";
    private static final String WEBHOOK = "/api/v1/billing/webhook";
    private static final String STATUS = CHECKOUTS + "/status";
    private static final long WEEK_SECONDS = 604800;

    @Container
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16");

    @DynamicPropertySource
    static void datasource(final DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private MockMvc http;

    @MockitoBean
    private StripeGateway stripe;

    @MockitoBean
    private CvGenerationScheduler scheduler;

    @Test
    void buyerStartsHostedCheckoutWithoutEmailOrSigningIn() throws Exception {
        // when
        final Started checkout = start("first");
        // then
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
        http.perform(get("/api/v1/user")).andExpect(status().isUnauthorized());
    }

    @Test
    void signedInitialPaymentCreatesAnExpiringClaimButRedirectDoesNot() throws Exception {
        // given
        final Started checkout = start("paid");
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
        final StripeGateway.Purchase purchase = paidPurchase("paid", "paid@example.com");
        when(stripe.retrievePurchase("cs_paid")).thenReturn(purchase);
        // when
        sessionEvent("evt_paid", "checkout.session.completed", "paid").andExpect(status().isOk());
        // then
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(true))
                .andExpect(jsonPath("$.paidPeriodStart").value(purchase.periodStart().toString()))
                .andExpect(jsonPath("$.expiresAt").value(purchase.periodEnd().toString()));
        http.perform(get("/api/v1/user")).andExpect(status().isUnauthorized());
    }

    @Test
    void racingClicksReuseOneStripeCheckout() throws Exception {
        // given
        final Set<UUID> created = ConcurrentHashMap.newKeySet();
        final UUID requestId = UUID.randomUUID();
        when(stripe.createCheckout(any(), anyString())).thenAnswer(invocation -> {
            created.add(invocation.getArgument(0));
            return new StripeGateway.CheckoutSession("cs_race", "https://checkout.stripe.com/c/pay/race",
                    Instant.now().plusSeconds(3600));
        });
        try (final ExecutorService executor = Executors.newFixedThreadPool(4)) {
            final CountDownLatch ready = new CountDownLatch(4);
            final CountDownLatch go = new CountDownLatch(1);
            final List<Future<String>> requests = new ArrayList<>();
            for (int index = 0; index < 4; index++) {
                requests.add(executor.submit(() -> {
                    ready.countDown();
                    go.await();
                    return begin(requestId).andExpect(status().isCreated())
                            .andReturn().getResponse().getContentAsString();
                }));
            }
            // when
            ready.await();
            go.countDown();
            final Set<String> tokens = new HashSet<>();
            for (final Future<String> request : requests) {
                tokens.add(JsonPath.read(request.get(), "$.checkoutToken"));
            }
            // then
            assertThat(tokens).hasSize(1);
            assertThat(created).containsExactly(requestId);
        }
    }

    @Test
    void forgedAndUnpaidEventsNeverCreateAClaim() throws Exception {
        // given
        final Started checkout = start("unpaid");
        when(stripe.retrievePurchase("cs_unpaid")).thenReturn(new StripeGateway.Purchase(
                "cs_unpaid", "cus_unpaid", "unpaid@example.com", "sub_unpaid", "incomplete", "in_unpaid", "open",
                "price_weekly", Instant.now(), Instant.now().plusSeconds(WEEK_SECONDS), "complete", "open",
                new StripeGateway.InitialInvoice("in_unpaid", Instant.now(), Instant.now().plusSeconds(WEEK_SECONDS))));
        // when / then
        http.perform(post(WEBHOOK).contentType(MediaType.APPLICATION_JSON)
                .header("Stripe-Signature", "t=1,v1=forged").content("{}"))
                .andExpect(status().isBadRequest());
        http.perform(post(WEBHOOK).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        sessionEvent("evt_unpaid", "checkout.session.completed", "unpaid").andExpect(status().isOk());
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
    }

    @Test
    void anUnpaidAttemptDoesNotBlockASuccessfulPurchaseForTheSameEmail() throws Exception {
        // given
        final Started unpaid = start("unpaid_attempt");
        when(stripe.retrievePurchase("cs_unpaid_attempt")).thenReturn(new StripeGateway.Purchase(
                "cs_unpaid_attempt", "cus_unpaid_attempt", "retry@example.com", "sub_unpaid_attempt", "incomplete",
                "in_unpaid_attempt", "open", "price_weekly", Instant.now(),
                Instant.now().plusSeconds(WEEK_SECONDS), "open", "open",
                new StripeGateway.InitialInvoice("in_unpaid_attempt", Instant.now(),
                        Instant.now().plusSeconds(WEEK_SECONDS))));
        webhook("evt_unpaid_attempt", "invoice.payment_failed", "{\"id\":\"in_unpaid_attempt\",\"parent\":{"
                + "\"subscription_details\":{\"metadata\":{\"checkout_id\":\"" + unpaid.requestId() + "\"}}}}")
                .andExpect(status().isOk());
        final Started paid = start("successful_retry");
        when(stripe.retrievePurchase("cs_successful_retry"))
                .thenReturn(paidPurchase("successful_retry", "retry@example.com"));
        when(stripe.reverseDuplicate(paid.requestId(), "sub_successful_retry", "in_successful_retry"))
                .thenReturn("duplicate_refunded");
        // when
        sessionEvent("evt_successful_retry", "checkout.session.completed", "successful_retry")
                .andExpect(status().isOk());
        // then
        checkoutStatus(unpaid).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
        checkoutStatus(paid).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(true));
    }

    @Test
    void aDelayedEventForAnEndedPurchaseDoesNotRefundItAfterAReplacementPurchase() throws Exception {
        // given
        final Started original = start("ended_original");
        final StripeGateway.Purchase originalPayment = paidPurchase("ended_original", "replacement@example.com");
        when(stripe.retrievePurchase("cs_ended_original")).thenReturn(originalPayment);
        sessionEvent("evt_ended_original_paid", "checkout.session.completed", "ended_original")
                .andExpect(status().isOk());
        when(stripe.retrievePurchase("cs_ended_original")).thenReturn(new StripeGateway.Purchase(
                originalPayment.sessionId(), originalPayment.customerId(), originalPayment.email(),
                originalPayment.subscriptionId(), "canceled", originalPayment.invoiceId(), "paid", "price_weekly",
                originalPayment.periodStart(), originalPayment.periodEnd(), "complete", "paid",
                originalPayment.initialInvoice()));
        final String subscriptionObject = "{\"id\":\"sub_ended_original\",\"metadata\":{\"checkout_id\":\""
                + original.requestId() + "\"}}";
        webhook("evt_ended_original_updated", "customer.subscription.updated", subscriptionObject)
                .andExpect(status().isOk());
        final Started replacement = start("replacement_purchase");
        when(stripe.retrievePurchase("cs_replacement_purchase"))
                .thenReturn(paidPurchase("replacement_purchase", "replacement@example.com"));
        sessionEvent("evt_replacement_paid", "checkout.session.completed", "replacement_purchase")
                .andExpect(status().isOk());
        when(stripe.reverseDuplicate(original.requestId(), "sub_ended_original", "in_ended_original"))
                .thenReturn("duplicate_refunded");
        // when
        webhook("evt_ended_original_deleted", "customer.subscription.deleted", subscriptionObject)
                .andExpect(status().isOk());
        // then
        verify(stripe, never()).reverseDuplicate(original.requestId(), "sub_ended_original", "in_ended_original");
        checkoutStatus(original).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
        checkoutStatus(replacement).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(true));
    }

    @Test
    void replayAndReorderedEventsDoNotDuplicateOrExtendThePaidWeek() throws Exception {
        // given
        final Started checkout = start("replay");
        final StripeGateway.Purchase purchase = paidPurchase("replay", "replay@example.com");
        when(stripe.retrievePurchase("cs_replay")).thenReturn(purchase);
        sessionEvent("evt_replay", "checkout.session.completed", "replay").andExpect(status().isOk());
        // when / then
        when(stripe.retrievePurchase("cs_replay")).thenThrow(BillingException.unavailable());
        sessionEvent("evt_replay", "checkout.session.completed", "replay").andExpect(status().isOk());
        doReturn(purchase).when(stripe).retrievePurchase("cs_replay");
        sessionEvent("evt_reordered", "checkout.session.expired", "replay").andExpect(status().isOk());
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(true))
                .andExpect(jsonPath("$.paidPeriodStart").value(purchase.periodStart().toString()))
                .andExpect(jsonPath("$.expiresAt").value(purchase.periodEnd().toString()));
        begin(checkout.requestId()).andExpect(status().isConflict());
    }

    @Test
    void aLatePaymentEventDoesNotRestartAnExpiredPaidWeek() throws Exception {
        // given
        final Started checkout = start("late");
        when(stripe.retrievePurchase("cs_late")).thenReturn(new StripeGateway.Purchase(
                "cs_late", "cus_late", "late@example.com", "sub_late", "active", "in_late", "paid",
                "price_weekly", Instant.parse("2026-09-01T00:00:00Z"), Instant.parse("2026-09-08T00:00:00Z"),
                "complete", "paid",
                new StripeGateway.InitialInvoice("in_late", Instant.parse("2026-09-01T00:00:00Z"),
                        Instant.parse("2026-09-08T00:00:00Z"))));
        // when / then
        sessionEvent("evt_late", "checkout.session.completed", "late").andExpect(status().isOk());
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
    }

    @Test
    void aStripeOutageCanBeRetriedWithoutReplacingTheCheckout() throws Exception {
        // given
        final UUID requestId = UUID.randomUUID();
        final Set<UUID> attempts = new HashSet<>();
        when(stripe.createCheckout(any(), anyString())).thenAnswer(invocation -> {
            attempts.add(invocation.getArgument(0));
            throw BillingException.unavailable();
        });
        begin(requestId).andExpect(status().isServiceUnavailable());
        doReturn(new StripeGateway.CheckoutSession("cs_retry", "https://checkout.stripe.com/c/pay/retry",
                Instant.now().plusSeconds(3600))).when(stripe).createCheckout(any(), anyString());
        // when / then
        begin(requestId).andExpect(status().isCreated());
        assertThat(attempts).containsExactly(requestId);
    }

    @Test
    void invoiceCanConfirmInitialPaymentBeforeTheCheckoutCompletionEvent() throws Exception {
        // given
        final Started checkout = start("invoice");
        when(stripe.retrievePurchase("cs_invoice")).thenReturn(paidPurchase("invoice", "invoice@example.com"));
        // when
        webhook("evt_invoice", "invoice.paid", "{\"id\":\"in_invoice\",\"parent\":{\"subscription_details\":{"
                + "\"metadata\":{\"checkout_id\":\"" + checkout.requestId() + "\"}}}}")
                .andExpect(status().isOk());
        // then
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(true));
    }

    @Test
    void anExpiredUnpaidSessionAllowsAFreshCheckout() throws Exception {
        // given
        final Started checkout = start("expired");
        when(stripe.retrievePurchase("cs_expired")).thenReturn(new StripeGateway.Purchase(
                "cs_expired", null, null, null, null, null, "unpaid", null, null, null, "expired", "unpaid",
                null));
        // when / then
        sessionEvent("evt_expired", "checkout.session.expired", "expired").andExpect(status().isOk());
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
        final Started fresh = start("fresh");
        assertThat(fresh.token()).isNotEqualTo(checkout.token());
    }

    @Test
    void anExpiredSessionIsNotReopenedWhileTheExpiryWebhookIsDelayed() throws Exception {
        // given
        final UUID requestId = UUID.randomUUID();
        when(stripe.createCheckout(any(), anyString())).thenReturn(new StripeGateway.CheckoutSession(
                "cs_delayed_expiry", "https://checkout.stripe.com/c/pay/delayed", Instant.now().minusSeconds(60)));
        begin(requestId).andExpect(status().isCreated());
        when(stripe.retrievePurchase("cs_delayed_expiry")).thenReturn(new StripeGateway.Purchase(
                "cs_delayed_expiry", null, null, null, null, null, "unpaid", null, null, null, "expired", "unpaid",
                null));
        // when / then
        begin(requestId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHECKOUT_EXPIRED"));
    }

    @Test
    void duplicateEmailPaymentsProduceOnlyOneRegistrationClaimAndRetryReversal() throws Exception {
        // given
        final Started first = start("unique");
        final Started second = start("duplicate");
        when(stripe.retrievePurchase("cs_unique")).thenReturn(paidPurchase("unique", "same@example.com"));
        when(stripe.retrievePurchase("cs_duplicate")).thenReturn(paidPurchase("duplicate", "SAME@example.com"));
        sessionEvent("evt_unique", "checkout.session.completed", "unique").andExpect(status().isOk());
        when(stripe.reverseDuplicate(second.requestId(), "sub_duplicate", "in_duplicate"))
                .thenThrow(BillingException.unavailable()).thenReturn("duplicate_refunded");
        // when / then
        sessionEvent("evt_duplicate", "checkout.session.completed", "duplicate")
                .andExpect(status().isServiceUnavailable());
        checkoutStatus(second).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false))
                .andExpect(jsonPath("$.duplicate").value(true));
        sessionEvent("evt_duplicate", "checkout.session.completed", "duplicate").andExpect(status().isOk());
        checkoutStatus(first).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(true))
                .andExpect(jsonPath("$.duplicate").value(false));
        checkoutStatus(second).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false))
                .andExpect(jsonPath("$.duplicate").value(true));
    }

    @Test
    void aPendingRefundRemainsRetryableUntilStripeConfirmsItsOutcome() throws Exception {
        // given
        start("pending_original");
        final Started duplicate = start("pending_duplicate");
        when(stripe.retrievePurchase("cs_pending_original"))
                .thenReturn(paidPurchase("pending_original", "pending@example.com"));
        when(stripe.retrievePurchase("cs_pending_duplicate"))
                .thenReturn(paidPurchase("pending_duplicate", "pending@example.com"));
        sessionEvent("evt_pending_original", "checkout.session.completed", "pending_original")
                .andExpect(status().isOk());
        when(stripe.reverseDuplicate(duplicate.requestId(), "sub_pending_duplicate", "in_pending_duplicate"))
                .thenReturn("duplicate_refund_pending").thenThrow(BillingException.unavailable());
        sessionEvent("evt_pending_duplicate", "checkout.session.completed", "pending_duplicate")
                .andExpect(status().isOk());
        // when / then
        sessionEvent("evt_pending_duplicate", "checkout.session.completed", "pending_duplicate")
                .andExpect(status().isServiceUnavailable());
        doReturn("duplicate_refunded").when(stripe).reverseDuplicate(
                duplicate.requestId(), "sub_pending_duplicate", "in_pending_duplicate");
        webhook("evt_refund_updated", "refund.updated", "{\"id\":\"re_pending\",\"metadata\":{\"checkout_id\":\""
                + duplicate.requestId() + "\"}}").andExpect(status().isOk());
        checkoutStatus(duplicate).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
    }

    private Started start(final String suffix) throws Exception {
        when(stripe.createCheckout(any(), anyString())).thenReturn(new StripeGateway.CheckoutSession(
                "cs_" + suffix, "https://checkout.stripe.com/c/pay/" + suffix, Instant.now().plusSeconds(3600)));
        final UUID requestId = UUID.randomUUID();
        final String body = begin(requestId).andExpect(status().isCreated())
                .andExpect(jsonPath("$.url").value("https://checkout.stripe.com/c/pay/" + suffix))
                .andReturn().getResponse().getContentAsString();
        return new Started(requestId, JsonPath.read(body, "$.checkoutToken"));
    }

    private ResultActions begin(final UUID requestId) throws Exception {
        return http.perform(post(CHECKOUTS).header("Idempotency-Key", requestId));
    }

    private ResultActions checkoutStatus(final Started checkout) throws Exception {
        return http.perform(get(STATUS).header("X-Checkout-Token", checkout.token()));
    }

    private StripeGateway.Purchase paidPurchase(final String suffix, final String email) {
        final Instant start = Instant.now().minusSeconds(60).truncatedTo(ChronoUnit.SECONDS);
        return new StripeGateway.Purchase("cs_" + suffix, "cus_" + suffix, email, "sub_" + suffix, "active",
                "in_" + suffix, "paid", "price_weekly", start, start.plusSeconds(WEEK_SECONDS), "complete", "paid",
                new StripeGateway.InitialInvoice("in_" + suffix, start, start.plusSeconds(WEEK_SECONDS)));
    }

    private ResultActions sessionEvent(final String id, final String type, final String suffix) throws Exception {
        return webhook(id, type, "{\"id\":\"cs_" + suffix + "\"}");
    }

    private ResultActions webhook(final String eventId, final String type, final String object) throws Exception {
        final String body = "{\"id\":\"" + eventId + "\",\"type\":\"" + type
                + "\",\"data\":{\"object\":" + object + "}}";
        final long timestamp = Instant.now().getEpochSecond();
        final Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("whsec_test".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        final String signature = HexFormat.of().formatHex(mac.doFinal(
                (timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
        return http.perform(post(WEBHOOK).contentType(MediaType.APPLICATION_JSON)
                .header("Stripe-Signature", "t=" + timestamp + ",v1=" + signature).content(body));
    }

    private record Started(UUID requestId, String token) { }
}
