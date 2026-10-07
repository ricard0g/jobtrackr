package com.ricard0g.jobtrackr_api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;
import com.ricard0g.jobtrackr_api.storage.R2ObjectStorage;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.jayway.jsonpath.JsonPath;
import com.stripe.Stripe;
import com.sun.net.httpserver.HttpServer;
import com.ricard0g.jobtrackr_api.support.PaidRegistrationFixture;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "jwt.signing-key=test-signing-key-with-at-least-32-characters", "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid", "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key", "jobtrackr.r2.bucket=test-bucket",
        "jobtrackr.stripe.enabled=true", "jobtrackr.stripe.secret-key=sk_test_fake",
        "jobtrackr.stripe.webhook-secret=" + RenewalIntegrationTest.WEBHOOK_SECRET,
        "jobtrackr.stripe.weekly-price-id=price_weekly",
        "jobtrackr.stripe.landing-origin=http://localhost:4321",
        "jobtrackr.stripe.app-origin=http://localhost:5173",
        "jobtrackr.stripe.portal-configuration-id=bpc_jobtrackr"
})
class RenewalIntegrationTest {
    static final String WEBHOOK_SECRET = "whsec_test";
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final Instant START = Instant.parse("2030-01-01T00:00:00Z");
    private static final Instant END = Instant.parse("2030-01-08T00:00:00Z");
    private static final Instant RENEWED_END = Instant.parse("2030-01-15T00:00:00Z");
    private static final java.util.concurrent.atomic.AtomicInteger NEXT_CLIENT =
            new java.util.concurrent.atomic.AtomicInteger(1);
    private static final Map<String, String> STRIPE_RESPONSES = new ConcurrentHashMap<>();
    private static final Map<String, String> STRIPE_PAYMENT_INTENTS = new ConcurrentHashMap<>();
    private static final Map<String, Long> STRIPE_REFUNDS = new ConcurrentHashMap<>();
    private static final AtomicInteger REGISTRATION_CLIENT = new AtomicInteger();
    private static final Map<String, Map<String, String>> CHECKOUT_REQUESTS = new ConcurrentHashMap<>();
    private static final Map<String, Long> CHECKOUT_EXPIRATIONS = new ConcurrentHashMap<>();
    private static HttpServer stripeServer;
    private static String originalApiBase;

    @Container
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16");

    @DynamicPropertySource
    static void datasource(final DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @BeforeAll
    static void fakeStripe() throws Exception {
        STRIPE_RESPONSES.put("/v1/prices/price_weekly", """
                {"id":"price_weekly","object":"price","active":true,"currency":"eur","unit_amount":1099,
                 "tax_behavior":"inclusive","recurring":{"interval":"week","interval_count":1}}
                """);
        originalApiBase = Stripe.getApiBase();
        stripeServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        stripeServer.createContext("/v1/", exchange -> {
            final String path = exchange.getRequestURI().getPath();
            String response = STRIPE_RESPONSES.getOrDefault(exchange.getRequestMethod() + " " + path,
                    STRIPE_RESPONSES.get(path));
            final boolean checkoutCreation = "/v1/checkout/sessions".equals(path)
                    && "POST".equals(exchange.getRequestMethod());
            if (checkoutCreation) {
                final Map<String, String> request = parameters(new String(
                        exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                CHECKOUT_REQUESTS.put(request.get("client_reference_id"), request);
                if (request.containsKey("customer")) {
                    response = """
                            {"id":"cs_%s","object":"checkout.session","url":"https://checkout.stripe.com/test",
                             "expires_at":%d}
                            """.formatted(request.get("client_reference_id"),
                                    CHECKOUT_EXPIRATIONS.getOrDefault(request.get("client_reference_id"),
                                            RENEWED_END.getEpochSecond()));
                }
            }
            if ("/v1/invoice_payments".equals(path)) {
                final String invoice = parameters(exchange.getRequestURI().getRawQuery()).get("invoice");
                final String intent = STRIPE_PAYMENT_INTENTS.get(invoice);
                if (intent != null) {
                    response = """
                            {"object":"list","data":[{"id":"ip_%s","object":"invoice_payment","status":"paid",
                             "payment":{"type":"payment_intent","payment_intent":"%s"}}],"has_more":false}
                            """.formatted(intent, intent);
                }
            }
            if ("/v1/refunds".equals(path) && "POST".equals(exchange.getRequestMethod())) {
                final Map<String, String> request = parameters(new String(
                        exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                STRIPE_REFUNDS.merge(request.get("payment_intent"), Long.parseLong(request.get("amount")), Long::sum);
            }
            if ("/v1/billing_portal/sessions".equals(path)) {
                final Map<String, String> request = parameters(new String(
                        exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                final boolean validReturn = "http://localhost:5173/settings/account".equals(request.get("return_url"))
                        && "bpc_jobtrackr".equals(request.get("configuration"));
                if (validReturn) {
                    response = "{\"id\":\"bps_test\",\"object\":\"billing_portal.session\",\"url\":"
                            + "\"https://billing.stripe.com/p/session/" + request.get("customer") + "\"}";
                }
            }
            final byte[] body = (response == null ? "{}" : response).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(response == null ? 404 : 200, body.length);
            try (final java.io.OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        stripeServer.start();
        Stripe.overrideApiBase("http://127.0.0.1:" + stripeServer.getAddress().getPort());
    }

    @AfterAll
    static void stopFakeStripe() {
        Stripe.overrideApiBase(originalApiBase);
        stripeServer.stop(0);
    }

    @Autowired
    private MockMvc http;
    @Autowired
    private JdbcClient jdbc;
    @MockitoBean(name = "billingClock")
    private Clock clock;
    @MockitoBean
    private CvGenerationScheduler scheduler;
    @MockitoBean
    private R2ObjectStorage storage;

    @Test
    void canceledUserResubscribesWithTheSameCustomerAndRetainsExistingWork() throws Exception {
        // given
        final Session original = register();
        final int applicationId = JsonPath.read(create(original).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.applicationId");
        final String document = http.perform(multipart("/api/v1/base-cvs")
                .file(new MockMultipartFile("file", "cv.md", "text/markdown",
                        "# Candidate\nJava developer".getBytes(StandardCharsets.UTF_8)))
                .header("Authorization", original.bearer())).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        final Number baseCvId = JsonPath.read(document, "$.baseCvId");
        final String user = http.perform(get("/api/v1/user").header("Authorization", original.bearer()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        when(clock.instant()).thenReturn(END.plusSeconds(1));
        stripeState(original, "canceled", "paid", START, END);
        webhook(original, "canceled", "customer.subscription.deleted").andExpect(status().isOk());
        limited(original);
        final String login = http.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(
                        (String) JsonPath.read(user, "$.userEmail"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        final Session signedIn = new Session(original.checkout(), original.customer(),
                "Bearer " + JsonPath.read(login, "$.accessToken"), original.companyId());
        final UUID checkout = UUID.randomUUID();
        // when
        final String response = resubscribe(signedIn, checkout).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        // then
        final Map<String, String> request = CHECKOUT_REQUESTS.get(checkout.toString());
        assertThat(request.get("customer")).isEqualTo(original.customer());
        assertThat(request.get("success_url")).isEqualTo("http://localhost:5173/settings/account?resubscribe=returned");
        assertThat(request.get("cancel_url")).isEqualTo("http://localhost:5173/settings/account");
        limited(original);
        final Session replacement = new Session(checkout, original.customer(), original.bearer(), original.companyId());
        final String email = JsonPath.read(user, "$.userEmail");
        STRIPE_RESPONSES.put("/v1/checkout/sessions/cs_" + checkout, """
                {"id":"cs_%s","object":"checkout.session","customer_details":{"email":"%s"},
                 "subscription":"sub_%s","invoice":"in_initial_%s","status":"complete","payment_status":"paid"}
                """.formatted(checkout, email, checkout, checkout));
        invoice("in_initial_" + checkout, "paid", END, RENEWED_END);
        stripeState(replacement, "active", "paid", END, RENEWED_END);
        webhook(replacement, "resubscribed", "checkout.session.completed").andExpect(status().isOk());
        paid(original, RENEWED_END);
        http.perform(get("/api/v1/user").header("Authorization", original.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value((String) JsonPath.read(user, "$.userId")));
        http.perform(get("/api/v1/applications/" + applicationId).header("Authorization", original.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applicationId").value(applicationId));
        http.perform(get("/api/v1/base-cvs").header("Authorization", original.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].baseCvId").value(baseCvId.intValue()));
        http.perform(get("/api/v1/billing/checkouts/status")
                .header("X-Checkout-Token", (String) JsonPath.read(response, "$.checkoutToken")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.registrationEligible").value(false));
        create(original).andExpect(status().isCreated());
        stripeState(replacement, "canceled", "paid", END, RENEWED_END);
        webhook(replacement, "canceled_again", "customer.subscription.deleted").andExpect(status().isOk());
        resubscribe(original, checkout).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHECKOUT_EXPIRED"));
        resubscribe(original, UUID.randomUUID()).andExpect(status().isCreated());
    }

    @ParameterizedTest
    @ValueSource(strings = {"active", "past_due", "unpaid"})
    void refusesResubscriptionWhileAnExistingSubscriptionCanStillRenew(final String subscriptionStatus)
            throws Exception {
        // given
        final Session session = register();
        stripeState(session, subscriptionStatus, "paid", START, END);
        webhook(session, "still_live", "customer.subscription.updated").andExpect(status().isOk());
        // when / then
        resubscribe(session, UUID.randomUUID()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SUBSCRIPTION_ALREADY_EXISTS"));
        http.perform(get("/api/v1/billing/subscription").header("Authorization", session.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canResubscribe").value(false));
    }

    @Test
    void concurrentResubscriptionsReserveOnlyOneCheckoutAndCannotBeReadThroughPublicCheckout() throws Exception {
        // given
        final Session session = canceledUser();
        try (final ExecutorService executor = Executors.newFixedThreadPool(4)) {
            final CountDownLatch ready = new CountDownLatch(4);
            final CountDownLatch go = new CountDownLatch(1);
            final List<Future<Integer>> requests = new ArrayList<>();
            final Map<UUID, Integer> statuses = new ConcurrentHashMap<>();
            for (int index = 0; index < 4; index++) {
                final UUID checkout = UUID.randomUUID();
                requests.add(executor.submit(() -> {
                    ready.countDown();
                    go.await();
                    final int status = resubscribe(session, checkout).andReturn().getResponse().getStatus();
                    statuses.put(checkout, status);
                    return status;
                }));
            }
            // when
            ready.await();
            go.countDown();
            final List<Integer> results = new ArrayList<>();
            for (final Future<Integer> request : requests) {
                results.add(request.get());
            }
            // then
            assertThat(results).containsExactlyInAnyOrder(201, 409, 409, 409);
            final UUID winningCheckout = statuses.entrySet().stream().filter(entry -> entry.getValue() == 201)
                    .findFirst().orElseThrow().getKey();
            resubscribe(session, winningCheckout).andExpect(status().isCreated());
            http.perform(post("/api/v1/billing/checkouts").header("Idempotency-Key", winningCheckout))
                    .andExpect(status().isConflict());
            final Session other = canceledUser();
            resubscribe(other, winningCheckout).andExpect(status().isConflict());
            limited(session);
        }
    }

    @Test
    void refusesAnotherCustomerInAVerifiedResubscriptionEvent() throws Exception {
        // given
        final Session original = canceledUser();
        final UUID checkout = UUID.randomUUID();
        resubscribe(original, checkout).andExpect(status().isCreated());
        final String email = "different-" + checkout + "@example.com";
        STRIPE_RESPONSES.put("/v1/checkout/sessions/cs_" + checkout, """
                {"id":"cs_%s","object":"checkout.session","customer_details":{"email":"%s"},
                 "subscription":"sub_%s","invoice":"in_initial_%s","status":"complete","payment_status":"paid"}
                """.formatted(checkout, email, checkout, checkout));
        final Session mismatched = new Session(checkout, "cus_other", original.bearer(), original.companyId());
        invoice("in_initial_" + checkout, "paid", END, RENEWED_END);
        stripeState(mismatched, "active", "paid", END, RENEWED_END);
        // when / then
        webhook(mismatched, "wrong_customer", "checkout.session.completed").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("STRIPE_PURCHASE_MISMATCH"));
        limited(original);
    }

    @Test
    void expiredReturningCheckoutAllowsAFreshAttemptEvenBeforeTheExpiryWebhook() throws Exception {
        // given
        final Session original = canceledUser();
        final UUID expired = UUID.randomUUID();
        final Instant expiresAt = END.plusSeconds(3600);
        CHECKOUT_EXPIRATIONS.put(expired.toString(), expiresAt.getEpochSecond());
        resubscribe(original, expired).andExpect(status().isCreated());
        STRIPE_RESPONSES.put("/v1/checkout/sessions/cs_" + expired, """
                {"id":"cs_%s","object":"checkout.session","customer":"%s","status":"expired",
                 "payment_status":"unpaid"}
                """.formatted(expired, original.customer()));
        when(clock.instant()).thenReturn(expiresAt.minusSeconds(1));
        resubscribe(original, expired).andExpect(status().isCreated());
        // when / then
        when(clock.instant()).thenReturn(expiresAt);
        resubscribe(original, UUID.randomUUID()).andExpect(status().isCreated());
        limited(original);
    }

    @Test
    void resubscriptionRequiresAnAuthenticatedUser() throws Exception {
        // when / then
        http.perform(get("/api/v1/billing/subscription")).andExpect(status().isUnauthorized());
        http.perform(post("/api/v1/billing/resubscribe").with(csrf())
                .header("Idempotency-Key", UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    private Session canceledUser() throws Exception {
        final Session session = register();
        when(clock.instant()).thenReturn(END.plusSeconds(1));
        stripeState(session, "canceled", "paid", START, END);
        webhook(session, "canceled", "customer.subscription.deleted").andExpect(status().isOk());
        return session;
    }

    private ResultActions resubscribe(final Session session, final UUID checkout) throws Exception {
        return http.perform(post("/api/v1/billing/resubscribe").header("Authorization", session.bearer())
                .header("Idempotency-Key", checkout));
    }

    @Test
    void portalUsesOnlyTheAuthenticatedUsersCustomerAndAFixedReturnPath() throws Exception {
        // given
        final Session owner = register();
        final Session other = register();
        STRIPE_RESPONSES.put("/v1/billing_portal/configurations/bpc_jobtrackr", """
                {"id":"bpc_jobtrackr","object":"billing_portal.configuration","active":true,
                 "features":{"payment_method_update":{"enabled":true},"invoice_history":{"enabled":true},
                 "subscription_cancel":{"enabled":true,"mode":"at_period_end"}}}
                """);
        // when / then
        http.perform(post("/api/v1/billing/portal").header("Authorization", owner.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":\"" + other.customer() + "\",\"returnUrl\":\"https://evil.example\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.url").value("https://billing.stripe.com/p/session/" + owner.customer()));
        when(clock.instant()).thenReturn(END);
        http.perform(post("/api/v1/billing/portal").header("Authorization", other.bearer()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.url").value("https://billing.stripe.com/p/session/" + other.customer()));
        http.perform(post("/api/v1/billing/portal").header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void portalRejectsMissingCustomersAndUnsafeCancellationConfiguration() throws Exception {
        // given
        final Session session = register();
        STRIPE_RESPONSES.put("/v1/billing_portal/configurations/bpc_jobtrackr", """
                {"id":"bpc_jobtrackr","object":"billing_portal.configuration","active":true,
                 "features":{"payment_method_update":{"enabled":true},"invoice_history":{"enabled":true},
                 "subscription_cancel":{"enabled":true,"mode":"immediately"}}}
                """);
        // when / then
        http.perform(post("/api/v1/billing/portal").header("Authorization", session.bearer()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("BILLING_UNAVAILABLE"));
        STRIPE_RESPONSES.remove("/v1/billing_portal/configurations/bpc_jobtrackr");
        http.perform(post("/api/v1/billing/portal").header("Authorization", session.bearer()))
                .andExpect(status().isServiceUnavailable());
        jdbc.sql("UPDATE billing_customers SET user_id = NULL WHERE stripe_customer_id = :customer")
                .param("customer", session.customer()).update();
        http.perform(post("/api/v1/billing/portal").header("Authorization", session.bearer()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BILLING_CUSTOMER_MISSING"));
    }

    @Test
    void paidRenewalExtendsAccessForTheSameSessionDespiteDuplicateAndDelayedEvents() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(END.plusSeconds(1));
        stripeState(session, "active", "paid", END, RENEWED_END);
        // when / then
        webhook(session, "renewal", "invoice.paid").andExpect(status().isOk());
        paid(session, RENEWED_END);
        webhook(session, "renewal", "invoice.paid").andExpect(status().isOk());
        webhook(session, "delayed_failure", "invoice.payment_failed").andExpect(status().isOk());
        webhook(session, "delayed_checkout", "checkout.session.completed").andExpect(status().isOk());
        paid(session, RENEWED_END);
        when(clock.instant()).thenReturn(RENEWED_END);
        limited(session);
    }

    @Test
    void cancelingRenewalKeepsThePaidWeekUntilItsExactEnd() throws Exception {
        // given
        final Session session = register();
        final String path = "/v1/subscriptions/sub_" + session.checkout();
        STRIPE_RESPONSES.put(path, STRIPE_RESPONSES.get(path).replace(
                "\"status\":\"active\"", "\"status\":\"active\",\"cancel_at_period_end\":true"));
        // when / then
        webhook(session, "cancel_renewal", "customer.subscription.updated").andExpect(status().isOk());
        when(clock.instant()).thenReturn(END.minusNanos(1));
        paid(session, END);
        create(session).andExpect(status().isCreated());
        when(clock.instant()).thenReturn(END);
        limited(session);
        create(session).andExpect(status().isForbidden());
        stripeState(session, "canceled", "paid", START, END);
        webhook(session, "deleted", "customer.subscription.deleted").andExpect(status().isOk());
        limited(session);
    }

    @Test
    void failedPaymentImmediatelyBlocksPaidActionsAndAPaidRetryRestoresTheSameSession() throws Exception {
        // given
        final Session session = register();
        create(session).andExpect(status().isCreated());
        when(clock.instant()).thenReturn(END.minusSeconds(60));
        stripeState(session, "active", "open", END, RENEWED_END);
        // when / then
        webhook(session, "failed", "invoice.payment_failed").andExpect(status().isOk());
        limited(session);
        create(session).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PAID_ACCESS_REQUIRED"));
        http.perform(get("/api/v1/applications").header("Authorization", session.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        when(clock.instant()).thenReturn(END.plus(1, ChronoUnit.DAYS));
        stripeState(session, "active", "paid", END, RENEWED_END);
        webhook(session, "retry_paid", "invoice.paid").andExpect(status().isOk());
        paid(session, RENEWED_END);
        create(session).andExpect(status().isCreated());
        webhook(session, "failed", "invoice.payment_failed").andExpect(status().isOk());
        paid(session, RENEWED_END);
    }

    @Test
    void bothFailedRetriesAndTerminalCancellationLeaveTheExistingSessionLimited() throws Exception {
        // given
        final Session session = register();
        stripeState(session, "past_due", "open", END, RENEWED_END);
        when(clock.instant()).thenReturn(END);
        // when / then
        webhook(session, "failed", "invoice.payment_failed").andExpect(status().isOk());
        limited(session);
        when(clock.instant()).thenReturn(END.plus(1, ChronoUnit.DAYS));
        webhook(session, "day1_failed", "invoice.payment_failed").andExpect(status().isOk());
        limited(session);
        when(clock.instant()).thenReturn(END.plus(3, ChronoUnit.DAYS));
        webhook(session, "day3_failed", "invoice.payment_failed").andExpect(status().isOk());
        stripeState(session, "canceled", "open", END, RENEWED_END);
        webhook(session, "canceled", "customer.subscription.deleted").andExpect(status().isOk());
        webhook(session, "delayed_paid", "invoice.paid").andExpect(status().isOk());
        limited(session);
        create(session).andExpect(status().isForbidden());
        http.perform(get("/api/v1/user").header("Authorization", session.bearer())).andExpect(status().isOk());
    }

    @Test
    void stripeReadFailureRollsBackTheEventSoRedeliveryCanRestoreAccess() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(END.plusSeconds(1));
        stripeState(session, "active", "paid", END, RENEWED_END);
        final String path = "/v1/subscriptions/sub_" + session.checkout();
        final String subscription = STRIPE_RESPONSES.remove(path);
        // when / then
        webhook(session, "outage", "invoice.paid").andExpect(status().isServiceUnavailable());
        limited(session);
        STRIPE_RESPONSES.put(path, subscription);
        webhook(session, "outage", "invoice.paid").andExpect(status().isOk());
        paid(session, RENEWED_END);
    }

    @Test
    void failedRenewalStillRejectsAnotherPurchaseAndItsRetryRestoresTheOriginalSession() throws Exception {
        // given
        final Session original = register();
        when(clock.instant()).thenReturn(END.plusSeconds(1));
        stripeState(original, "past_due", "open", END, RENEWED_END);
        webhook(original, "failed", "invoice.payment_failed").andExpect(status().isOk());
        limited(original);
        final String email = jdbc.sql("SELECT checkout_email FROM billing_checkouts WHERE id = :id")
                .param("id", original.checkout()).query(String.class).single();
        final Attempt second = startPurchase(email);
        stripeState(second.session(), "active", "paid", END, RENEWED_END);
        refundResponses();
        // when / then
        webhook(second.session(), "paid", "checkout.session.completed").andExpect(status().isOk());
        http.perform(get("/api/v1/billing/checkouts/status").header("X-Checkout-Token", second.token()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.duplicate").value(true))
                .andExpect(jsonPath("$.registrationEligible").value(false));
        stripeState(original, "active", "paid", END, RENEWED_END);
        webhook(original, "retry_paid", "invoice.paid").andExpect(status().isOk());
        paid(original, RENEWED_END);
        create(original).andExpect(status().isCreated());
    }

    @ParameterizedTest
    @ValueSource(strings = {"paid", "open"})
    void delayedDuplicateRefundTargetsInitialPaymentEvenAfterRenewal(final String renewalStatus) throws Exception {
        // given
        final Session original = register();
        final String email = jdbc.sql("SELECT checkout_email FROM billing_checkouts WHERE id = :id")
                .param("id", original.checkout()).query(String.class).single();
        final Attempt duplicate = startPurchase(email);
        when(clock.instant()).thenReturn(END.plusSeconds(1));
        stripeState(duplicate.session(), "active", renewalStatus, END, RENEWED_END);
        final String currentInvoice = "in_current_" + duplicate.session().checkout() + "_" + END.getEpochSecond();
        if ("open".equals(renewalStatus)) {
            final String path = "/v1/invoices/" + currentInvoice;
            STRIPE_RESPONSES.put(path, STRIPE_RESPONSES.get(path).replace("\"amount_paid\":1099", "\"amount_paid\":0"));
        }
        final String initialIntent = "pi_initial_" + duplicate.session().checkout();
        final String renewalIntent = "pi_renewal_" + duplicate.session().checkout();
        STRIPE_PAYMENT_INTENTS.put("in_initial_" + duplicate.session().checkout(), initialIntent);
        STRIPE_PAYMENT_INTENTS.put(currentInvoice, renewalIntent);
        refundResponses();
        // when / then
        webhook(duplicate.session(), "delayed_initial", "checkout.session.completed").andExpect(status().isOk());
        http.perform(get("/api/v1/billing/checkouts/status").header("X-Checkout-Token", duplicate.token()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.duplicate").value(true));
        assertThat(STRIPE_REFUNDS.getOrDefault(initialIntent, 0L)).isEqualTo(1099L);
        assertThat(STRIPE_REFUNDS.getOrDefault(renewalIntent, 0L)).isZero();
        webhook(duplicate.session(), "delayed_initial", "checkout.session.completed").andExpect(status().isOk());
        assertThat(STRIPE_REFUNDS.getOrDefault(initialIntent, 0L)).isEqualTo(1099L);
    }

    private static Map<String, String> parameters(final String encoded) {
        final Map<String, String> result = new HashMap<>();
        for (final String parameter : encoded.split("&")) {
            final String[] pair = parameter.split("=", 2);
            result.put(URLDecoder.decode(pair[0], StandardCharsets.UTF_8),
                    URLDecoder.decode(pair[1], StandardCharsets.UTF_8));
        }
        return result;
    }

    private Attempt startPurchase(final String email) throws Exception {
        final UUID checkout = UUID.randomUUID();
        final String customer = "cus_" + checkout;
        final String sessionId = "cs_" + checkout;
        STRIPE_RESPONSES.put("/v1/prices/price_weekly", """
                {"id":"price_weekly","object":"price","active":true,"currency":"eur","unit_amount":1099,
                 "tax_behavior":"inclusive","recurring":{"interval":"week","interval_count":1}}
                """);
        STRIPE_RESPONSES.put("/v1/checkout/sessions", """
                {"id":"%s","object":"checkout.session","url":"https://checkout.stripe.com/test",
                 "expires_at":%d}
                """.formatted(sessionId, Instant.now().plusSeconds(3600).getEpochSecond()));
        final String body = http.perform(post("/api/v1/billing/checkouts").header("Idempotency-Key", checkout))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        STRIPE_RESPONSES.put("/v1/checkout/sessions/" + sessionId, """
                {"id":"%s","object":"checkout.session","customer_details":{"email":"%s"},
                 "subscription":"sub_%s","invoice":"in_initial_%s","status":"complete","payment_status":"paid"}
                """.formatted(sessionId, email, checkout, checkout));
        final Session session = new Session(checkout, customer, null, 0);
        invoice("in_initial_" + checkout, "paid", START, END);
        return new Attempt(session, JsonPath.read(body, "$.checkoutToken"));
    }

    private void refundResponses() {
        STRIPE_RESPONSES.put("/v1/invoice_payments", """
                {"object":"list","data":[{"id":"ip_duplicate","object":"invoice_payment","status":"paid",
                 "payment":{"type":"payment_intent","payment_intent":"pi_duplicate"}}],"has_more":false}
                """);
        STRIPE_RESPONSES.put("GET /v1/refunds", "{\"object\":\"list\",\"data\":[],\"has_more\":false}");
        STRIPE_RESPONSES.put("POST /v1/refunds",
                "{\"id\":\"re_duplicate\",\"object\":\"refund\",\"status\":\"succeeded\"}");
    }

    private ResultActions create(final Session session) throws Exception {
        return http.perform(post("/api/v1/applications").header("Authorization", session.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"companyId":%d,"applicationTitle":"Engineer","applicationStatus":"IN_REVIEW"}
                        """.formatted(session.companyId())));
    }

    private Session register() throws Exception {
        final String email = "renewal-" + UUID.randomUUID() + "@example.com";
        final String registration = PaidRegistrationFixture.withVerifiedPurchase(jdbc,
                "{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email));
        final String response = http.perform(post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON).content(registration)
                .with(request -> {
                    request.setRemoteAddr("192.0.2." + REGISTRATION_CLIENT.incrementAndGet());
                    return request;
                }))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        final UUID checkout = jdbc.sql("SELECT id FROM billing_checkouts WHERE checkout_email = CAST(:email AS citext)")
                .param("email", email).query(UUID.class).single();
        final String customer = jdbc.sql("SELECT stripe_customer_id FROM billing_customers "
                + "WHERE checkout_email = CAST(:email AS citext)").param("email", email).query(String.class).single();
        jdbc.sql("UPDATE billing_checkouts SET stripe_session_id = :session WHERE id = :id")
                .param("session", "cs_" + checkout).param("id", checkout).update();
        final String bearer = "Bearer " + JsonPath.read(response, "$.accessToken");
        final String company = http.perform(post("/api/v1/companies").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"companyName\":\"Company %s\"}".formatted(email)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        final Session session = new Session(checkout, customer, bearer, JsonPath.read(company, "$.companyId"));
        STRIPE_RESPONSES.put("/v1/checkout/sessions/cs_" + checkout, """
                {"id":"cs_%s","object":"checkout.session","customer_details":{"email":"%s"},
                 "subscription":"sub_%s","invoice":"in_initial_%s","status":"complete","payment_status":"paid"}
                """.formatted(checkout, email, checkout, checkout));
        invoice("in_initial_" + checkout, "paid", START, END);
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        stripeState(session, "active", "paid", START, END);
        webhook(session, "initial", "checkout.session.completed").andExpect(status().isOk());
        paid(session, END);
        return session;
    }

    private void stripeState(final Session session, final String subscriptionStatus, final String paymentStatus,
                             final Instant start, final Instant end) {
        final String invoiceId = "in_current_" + session.checkout() + "_" + start.getEpochSecond();
        STRIPE_RESPONSES.put("/v1/subscriptions/sub_" + session.checkout(), """
                {"id":"sub_%s","object":"subscription","customer":"%s","status":"%s",
                 "latest_invoice":"%s","items":{"object":"list","data":[{"id":"si_weekly",
                 "object":"subscription_item","price":{"id":"price_weekly","object":"price"}}]}}
                """.formatted(session.checkout(), session.customer(), subscriptionStatus, invoiceId));
        invoice(invoiceId, paymentStatus, start, end);
    }

    private void invoice(final String id, final String status, final Instant start, final Instant end) {
        STRIPE_RESPONSES.put("/v1/invoices/" + id, """
                {"id":"%s","object":"invoice","status":"%s","amount_paid":1099,"lines":{"object":"list","data":[
                 {"id":"il_weekly","object":"line_item","period":{"start":%d,"end":%d}}]}}
                """.formatted(id, status, start.getEpochSecond(), end.getEpochSecond()));
    }

    private ResultActions webhook(final Session session, final String suffix, final String type) throws Exception {
        final String objectId = type.startsWith("checkout.") ? "cs_" + session.checkout()
                : type.startsWith("invoice.") ? "in_current_" + session.checkout() : "sub_" + session.checkout();
        final String body = """
                {"id":"evt_%s_%s","type":"%s","data":{"object":{"id":"%s",
                 "metadata":{"checkout_id":"%s"},
                 "parent":{"subscription_details":{"metadata":{"checkout_id":"%s"}}}}}}
                """.formatted(session.checkout(), suffix, type, objectId, session.checkout(), session.checkout());
        final long timestamp = Instant.now().getEpochSecond();
        final Mac mac = Mac.getInstance(HMAC_ALGORITHM);
        mac.init(new SecretKeySpec(WEBHOOK_SECRET.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
        final String signature = HexFormat.of().formatHex(mac.doFinal(
                (timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
        return http.perform(post("/api/v1/billing/webhook").contentType(MediaType.APPLICATION_JSON)
                .header("Stripe-Signature", "t=" + timestamp + ",v1=" + signature).content(body));
    }

    private void paid(final Session session, final Instant end) throws Exception {
        http.perform(get("/api/v1/user/entitlement").header("Authorization", session.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.access").value("PAID"))
                .andExpect(jsonPath("$.paidUntil").value(end.toString()));
    }

    private void limited(final Session session) throws Exception {
        http.perform(get("/api/v1/user/entitlement").header("Authorization", session.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.access").value("LIMITED"));
    }

    private record Attempt(Session session, String token) { }

    private record Session(UUID checkout, String customer, String bearer, int companyId) { }
}
