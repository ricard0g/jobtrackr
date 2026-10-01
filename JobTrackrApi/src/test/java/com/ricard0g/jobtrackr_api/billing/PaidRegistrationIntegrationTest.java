package com.ricard0g.jobtrackr_api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.registration.RegistrationEmailSender;
import com.ricard0g.jobtrackr_api.registration.RegistrationService;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
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
class PaidRegistrationIntegrationTest {
    private static final String CHECKOUTS = "/api/v1/billing/checkouts";
    private static final String WEBHOOK = "/api/v1/billing/webhook";
    private static final String STATUS = CHECKOUTS + "/status";
    private static final long WEEK_SECONDS = 604800;
    private static final AtomicInteger NEXT_CLIENT =
            new AtomicInteger(1);

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

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private UserRepository users;

    @MockitoBean
    private RegistrationEmailSender emailSender;

    @MockitoBean
    private StripeGateway stripe;

    @MockitoBean
    private CvGenerationScheduler scheduler;

    @Test
    void paidBuyerVerifiesCheckoutEmailAndReceivesOneNormalSession() throws Exception {
        // given
        final Started checkout = start("registration");
        when(stripe.retrievePurchase("cs_registration"))
                .thenReturn(paidPurchase("registration", "buyer@example.com"));
        sessionEvent("evt_registration", "checkout.session.completed", "registration").andExpect(status().isOk());
        // when
        http.perform(post("/api/v1/auth/registration/verification").with(newClient())
                .header("X-Checkout-Token", checkout.token())).andExpect(status().isAccepted());
        final ArgumentCaptor<String> token = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendVerification(eq("buyer@example.com"), token.capture(),
                any(Instant.class));
        // then
        http.perform(get("/api/v1/auth/registration/verification").header("X-Verification-Token", token.getValue()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value("buyer@example.com"));
        final String body = """
                {"email":"buyer@example.com","password":"StrongPassword123!","verificationToken":"%s"}
                """.formatted(token.getValue());
        final String session = http.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.userEmail").value("buyer@example.com"))
                .andExpect(cookie()
                        .httpOnly("refresh_token", true))
                .andReturn().getResponse().getContentAsString();
        http.perform(get("/api/v1/user").header("Authorization", "Bearer " + JsonPath.read(session, "$.accessToken")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.userEmail").value("buyer@example.com"));
        http.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(false));
    }

    @Test
    void publicPasswordSignupWithoutVerifiedPurchaseIsClosed() throws Exception {
        http.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"visitor@example.com","password":"StrongPassword123!"}
                        """))
                .andExpect(status().isForbidden());
        http.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"visitor@example.com","password":"StrongPassword123!"}
                        """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void mismatchedEmailCannotConsumeTheVerifiedClaim() throws Exception {
        final String token = paidLink("mismatch", "fixed@example.com");
        register("other@example.com", token).andExpect(status().isForbidden());
        http.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"other@example.com","password":"StrongPassword123!"}
                        """))
                .andExpect(status().isUnauthorized());
        register("fixed@example.com", token).andExpect(status().isCreated());
    }

    @Test
    void unpaidAndUnknownCheckoutsCannotRequestEmailOrCreateAUser() throws Exception {
        final Started checkout = start("no_payment");
        http.perform(post("/api/v1/auth/registration/verification").with(newClient())
                .header("X-Checkout-Token", checkout.token())).andExpect(status().isForbidden());
        http.perform(post("/api/v1/auth/registration/verification").with(newClient())
                .header("X-Checkout-Token", "unknown")).andExpect(status().isForbidden());
        register("unpaid@example.com", "invented").andExpect(status().isForbidden());
        verifyNoInteractions(emailSender);
    }

    @Test
    void failedPaymentAfterEmailDeliveryRejectsRegistration() throws Exception {
        final String token = paidLink("revoked", "revoked@example.com");
        final StripeGateway.Purchase original = paidPurchase("revoked", "revoked@example.com");
        when(stripe.retrievePurchase("cs_revoked")).thenReturn(new StripeGateway.Purchase(
                original.sessionId(), original.customerId(), original.email(), original.subscriptionId(), "past_due",
                original.invoiceId(), "open", original.priceId(), original.periodStart(), original.periodEnd(),
                "complete"));
        sessionEvent("evt_revoked_failed", "checkout.session.completed", "revoked").andExpect(status().isOk());
        register("revoked@example.com", token).andExpect(status().isForbidden());
        http.perform(get("/api/v1/auth/registration/verification").header("X-Verification-Token", token))
                .andExpect(status().isForbidden());
    }

    @Test
    void expiredEmailLinkCanBeReplacedWhileThePurchaseIsStillPaid() throws Exception {
        final String token = paidLink("expired_link", "expired-link@example.com");
        jdbc.sql("UPDATE registration_email_verifications SET expires_at = clock_timestamp() - interval '1 second' "
                + "WHERE token_hash = :hash")
                .param("hash", RegistrationService.hash(token)).update();
        register("expired-link@example.com", token).andExpect(status().isForbidden());
        final String checkoutToken = jdbc.sql(
                "SELECT return_token FROM billing_checkouts WHERE stripe_session_id = :id")
                .param("id", "cs_expired_link").query(String.class).single();
        clearInvocations(emailSender);
        http.perform(post("/api/v1/auth/registration/verification").with(newClient())
                .header("X-Checkout-Token", checkoutToken))
                .andExpect(status().isAccepted());
        final ArgumentCaptor<String> replacement = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendVerification(eq("expired-link@example.com"),
                replacement.capture(), any(Instant.class));
        register("expired-link@example.com", replacement.getValue()).andExpect(status().isCreated());
    }

    @Test
    void paidWeekExpiryInvalidatesAnAlreadyDeliveredEmailLink() throws Exception {
        final String token = paidLink("ended_week", "ended-week@example.com");
        jdbc.sql("UPDATE registration_claims SET expires_at = clock_timestamp() - interval '1 second' "
                + "WHERE checkout_id = (SELECT id FROM billing_checkouts WHERE stripe_session_id = :id)")
                .param("id", "cs_ended_week").update();
        register("ended-week@example.com", token).andExpect(status().isForbidden());
    }

    @Test
    void racingVerifiedRegistrationsIssueOnlyOneUserSession() throws Exception {
        final String token = paidLink("registration_race", "race-buyer@example.com");
        try (final ExecutorService executor = Executors.newFixedThreadPool(2)) {
            final CountDownLatch ready = new CountDownLatch(2);
            final CountDownLatch go = new CountDownLatch(1);
            final List<Future<Integer>> requests = new ArrayList<>();
            for (int index = 0; index < 2; index++) {
                requests.add(executor.submit(() -> {
                    ready.countDown();
                    go.await();
                    return register("race-buyer@example.com", token).andReturn().getResponse().getStatus();
                }));
            }
            ready.await();
            go.countDown();
            final List<Integer> statuses = new ArrayList<>();
            for (final Future<Integer> request : requests) {
                statuses.add(request.get());
            }
            assertThat(statuses).containsExactlyInAnyOrder(201, 403);
        }
    }

    @Test
    void failedEmailDeliveryLeavesTheClaimAvailableAndDoesNotAuthorizeTheUndeliveredToken() throws Exception {
        final Started checkout = start("delivery_failure");
        when(stripe.retrievePurchase("cs_delivery_failure"))
                .thenReturn(paidPurchase("delivery_failure", "delivery@example.com"));
        sessionEvent("evt_delivery_failure", "checkout.session.completed", "delivery_failure")
                .andExpect(status().isOk());
        doThrow(new BillingException(HttpStatus.SERVICE_UNAVAILABLE,
                "REGISTRATION_EMAIL_UNAVAILABLE", "Email unavailable"))
                .when(emailSender).sendVerification(anyString(), anyString(), any(Instant.class));
        http.perform(post("/api/v1/auth/registration/verification").with(newClient())
                .header("X-Checkout-Token", checkout.token()))
                .andExpect(status().isServiceUnavailable());
        final ArgumentCaptor<String> failedToken = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendVerification(eq("delivery@example.com"),
                failedToken.capture(), any(Instant.class));
        register("delivery@example.com", failedToken.getValue()).andExpect(status().isForbidden());
        checkoutStatus(checkout).andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationEligible").value(true));
    }

    @Test
    void existingUserIsNeverLinkedOrMergedByCheckoutEmailEquality() throws Exception {
        users.saveAndFlush(User.googleJustInTime("existing-buyer@example.com"));
        final String token = paidLink("existing_user", "existing-buyer@example.com");
        register("existing-buyer@example.com", token).andExpect(status().isConflict());
        http.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("""
                        {"email":"existing-buyer@example.com","password":"StrongPassword123!"}
                        """))
                .andExpect(status().isUnauthorized());
        http.perform(get("/api/v1/auth/registration/verification").header("X-Verification-Token", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value("existing-buyer@example.com"));
    }

    private String paidLink(final String suffix, final String email) throws Exception {
        final Started checkout = start(suffix);
        when(stripe.retrievePurchase("cs_" + suffix)).thenReturn(paidPurchase(suffix, email));
        sessionEvent("evt_" + suffix, "checkout.session.completed", suffix).andExpect(status().isOk());
        http.perform(post("/api/v1/auth/registration/verification").with(newClient())
                .header("X-Checkout-Token", checkout.token()))
                .andExpect(status().isAccepted());
        final ArgumentCaptor<String> token = ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendVerification(eq(email), token.capture(), any(Instant.class));
        return token.getValue();
    }

    private ResultActions register(final String email, final String token) throws Exception {
        return http.perform(post("/api/v1/auth/register")
                .with(request -> {
                    request.setRemoteAddr("198.51.100." + (Math.floorMod(email.hashCode(), 200) + 1));
                    return request;
                })
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"email":"%s","password":"StrongPassword123!","verificationToken":"%s"}
                        """.formatted(email, token)));
    }

    private static RequestPostProcessor newClient() {
        return request -> {
            request.setRemoteAddr("203.0.113." + NEXT_CLIENT.getAndIncrement());
            return request;
        };
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
                "in_" + suffix, "paid", "price_weekly", start, start.plusSeconds(WEEK_SECONDS), "complete");
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
