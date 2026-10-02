package com.ricard0g.jobtrackr_api.billing;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
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
@Testcontainers
@TestPropertySource(properties = {
        "jwt.signing-key=test-signing-key-with-at-least-32-characters", "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid", "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key", "jobtrackr.r2.bucket=test-bucket",
        "jobtrackr.stripe.enabled=true", "jobtrackr.stripe.secret-key=sk_test_fake",
        "jobtrackr.stripe.webhook-secret=" + RenewalIntegrationTest.WEBHOOK_SECRET,
        "jobtrackr.stripe.weekly-price-id=price_weekly",
        "jobtrackr.stripe.landing-origin=http://localhost:4321"
})
class RenewalIntegrationTest {
    static final String WEBHOOK_SECRET = "whsec_test";
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final Instant START = Instant.parse("2030-01-01T00:00:00Z");
    private static final Instant END = Instant.parse("2030-01-08T00:00:00Z");
    private static final Instant RENEWED_END = Instant.parse("2030-01-15T00:00:00Z");
    private static final Map<String, String> STRIPE_RESPONSES = new ConcurrentHashMap<>();
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
        originalApiBase = Stripe.getApiBase();
        stripeServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        stripeServer.createContext("/v1/", exchange -> {
            final String response = STRIPE_RESPONSES.get(exchange.getRequestURI().getPath());
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
                .contentType(MediaType.APPLICATION_JSON).content(registration))
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
                {"id":"%s","object":"invoice","status":"%s","lines":{"object":"list","data":[
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

    private record Session(UUID checkout, String customer, String bearer, int companyId) { }
}
