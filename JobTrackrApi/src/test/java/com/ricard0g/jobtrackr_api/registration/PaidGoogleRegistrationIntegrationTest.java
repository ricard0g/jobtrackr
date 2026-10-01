package com.ricard0g.jobtrackr_api.registration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
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

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.billing.StripeGateway;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.security.oauth.MockGoogleOidcServer;
import com.ricard0g.jobtrackr_api.support.PaidRegistrationFixture;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

import jakarta.servlet.http.Cookie;

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
        "jobtrackr.stripe.landing-origin=http://localhost:4321",
        "jobtrackr.google.enabled=true",
        "jobtrackr.google.client-id=test-google-client",
        "jobtrackr.google.client-secret=test-google-secret",
        "jobtrackr.google.public-origin=http://localhost:5173",
        "jobtrackr.google.redirect-uri=http://localhost/api/v1/auth/oauth2/callback/google"
})
class PaidGoogleRegistrationIntegrationTest {
    private static final String ORIGIN = "http://localhost:5173";
    private static final String INTENT = "/api/v1/auth/registration/google";
    private static final String CLAIM = "/api/v1/auth/registration/claim";
    private static final String START = "/api/v1/auth/oauth2/authorization/google";
    private static final long WEEK_SECONDS = 604800;
    private static final AtomicInteger NEXT_CLIENT = new AtomicInteger(1);
    private static final MockGoogleOidcServer GOOGLE = MockGoogleOidcServer.start();

    @Container
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16");

    @DynamicPropertySource
    static void properties(final DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("jobtrackr.google.issuer-uri", GOOGLE::issuer);
        registry.add("jobtrackr.google.authorization-uri", GOOGLE::authorizationEndpoint);
        registry.add("jobtrackr.google.token-uri", GOOGLE::tokenEndpoint);
        registry.add("jobtrackr.google.jwk-set-uri", GOOGLE::jwkSetEndpoint);
    }

    @AfterAll
    static void stopGoogle() {
        GOOGLE.close();
    }

    @Autowired
    private MockMvc http;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private UserRepository users;

    @Autowired
    private UserIdentityRepository identities;

    @MockitoBean
    private RegistrationEmailSender emailSender;

    @MockitoBean
    private StripeGateway stripe;

    @MockitoBean
    private CvGenerationScheduler scheduler;

    @Test
    void paidBuyerRegistersWithMatchingVerifiedGoogleEmailAndReceivesNormalSession() throws Exception {
        // given
        final String checkoutToken = paidCheckout("google_success", "google-buyer@example.com");
        final String subject = "subject-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, "Google-Buyer@Example.com", true);
        // when
        http.perform(get(CLAIM).header("X-Checkout-Token", checkoutToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value("google-buyer@example.com"));
        final MvcResult callback = registerWithGoogle("X-Checkout-Token", checkoutToken);
        // then
        assertThat(callback.getResponse().getRedirectedUrl()).isEqualTo(ORIGIN + "/");
        assertThat(callback.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        final Cookie refresh = callback.getResponse().getCookie("refresh_token");
        assertThat(refresh).isNotNull();
        final String session = http.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(refresh))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.userEmail").value("google-buyer@example.com"))
                .andReturn().getResponse().getContentAsString();
        final UUID userId = UUID.fromString(JsonPath.read(session, "$.user.userId"));
        final User user = users.findById(userId).orElseThrow();
        assertThat(user.isUserEmailVerified()).isTrue();
        assertThat(user.getUserPasswordHash()).isNull();
        final UserIdentity identity = identities.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)
                .orElseThrow();
        assertThat(identity.getUser().getUserId()).isEqualTo(userId);
        assertThat(jdbc.sql("SELECT user_id FROM billing_customers WHERE stripe_customer_id = 'cus_google_success'")
                .query(UUID.class).single()).isEqualTo(userId);
        http.perform(get("/api/v1/billing/checkouts/status").header("X-Checkout-Token", checkoutToken))
                .andExpect(jsonPath("$.registrationEligible").value(false));
        GOOGLE.planSuccess(subject, "google-buyer@example.com", true);
        final MvcResult returning = completeFlow(START, null, new Cookie[0]);
        assertThat(returning.getResponse().getRedirectedUrl()).isEqualTo(ORIGIN + "/");
        http.perform(post("/api/v1/auth/refresh").with(csrf())
                        .cookie(returning.getResponse().getCookie("refresh_token")))
                .andExpect(jsonPath("$.user.userId").value(userId.toString()));
    }

    @Test
    void emailLinkTokenCanAlsoStartGoogleRegistration() throws Exception {
        // given
        final String token = verificationToken("link-google@example.com");
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "link-google@example.com", true);
        // when
        final MvcResult callback = registerWithGoogle("X-Verification-Token", token);
        // then
        assertThat(callback.getResponse().getRedirectedUrl()).isEqualTo(ORIGIN + "/");
        assertThat(users.findByUserEmail("link-google@example.com")).isPresent();
    }

    @Test
    void mismatchedGoogleEmailCreatesNoUserAndLeavesTheClaimAvailable() throws Exception {
        // given
        final String checkoutToken = paidCheckout("google_mismatch", "fixed-google@example.com");
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "other-google@example.com", true);
        final long userCount = users.count();
        // when
        final MvcResult callback = registerWithGoogle("X-Checkout-Token", checkoutToken);
        // then
        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/register?oauthResult=mismatch");
        assertThat(callback.getResponse().getCookie("refresh_token")).isNull();
        assertThat(users.count()).isEqualTo(userCount);
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "fixed-google@example.com", true);
        assertThat(registerWithGoogle("X-Checkout-Token", checkoutToken).getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/");
    }

    @Test
    void unverifiedGoogleEmailCannotConsumeTheClaim() throws Exception {
        final String checkoutToken = paidCheckout("google_unverified", "unverified-google@example.com");
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "unverified-google@example.com", false);
        final MvcResult callback = registerWithGoogle("X-Checkout-Token", checkoutToken);
        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/register?oauthResult=failed");
        assertThat(users.findByUserEmail("unverified-google@example.com")).isEmpty();
    }

    @Test
    void consumedClaimCannotBeReplayedByAnotherGoogleIdentity() throws Exception {
        // given
        final String checkoutToken = paidCheckout("google_replay", "replay-google@example.com");
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "replay-google@example.com", true);
        final StartedFlow pending = startRegistration("X-Checkout-Token", checkoutToken);
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "replay-google@example.com", true);
        assertThat(registerWithGoogle("X-Checkout-Token", checkoutToken).getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/");
        final long userCount = users.count();
        // when
        final MvcResult replay = callback(pending);
        // then
        assertThat(replay.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/register?oauthResult=registration_used");
        assertThat(replay.getResponse().getCookie("refresh_token")).isNull();
        assertThat(users.count()).isEqualTo(userCount);
        intent("X-Checkout-Token", checkoutToken).andExpect(status().isForbidden());
    }

    @Test
    void paidWeekEndingBeforeTheCallbackRejectsRegistration() throws Exception {
        // given
        final String checkoutToken = paidCheckout("google_expired", "expired-google@example.com");
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "expired-google@example.com", true);
        final StartedFlow pending = startRegistration("X-Checkout-Token", checkoutToken);
        jdbc.sql("UPDATE registration_claims SET expires_at = clock_timestamp() - interval '1 second' "
                + "WHERE checkout_id = (SELECT id FROM billing_checkouts WHERE stripe_session_id = 'cs_google_expired')")
                .update();
        // when
        final MvcResult callback = callback(pending);
        // then
        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/register?oauthResult=registration_expired");
        assertThat(users.findByUserEmail("expired-google@example.com")).isEmpty();
        intent("X-Checkout-Token", checkoutToken).andExpect(status().isForbidden());
        http.perform(get(CLAIM).header("X-Checkout-Token", checkoutToken)).andExpect(status().isForbidden());
    }

    @Test
    void unpaidUnknownOrMissingTokensCannotStartGoogleRegistration() throws Exception {
        final String unpaid = start("google_unpaid");
        intent("X-Checkout-Token", unpaid).andExpect(status().isForbidden());
        intent("X-Checkout-Token", "unknown").andExpect(status().isForbidden());
        intent("X-Verification-Token", "unknown").andExpect(status().isForbidden());
        http.perform(post(INTENT).with(newClient()).with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void unknownGoogleIdentityWithoutAClaimCannotCreateAUser() throws Exception {
        // given
        paidCheckout("google_no_intent", "no-intent-google@example.com");
        final String subject = "subject-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, "no-intent-google@example.com", true);
        final long userCount = users.count();
        // when
        final MvcResult login = completeFlow(START, null, new Cookie[0]);
        final MvcResult register = completeFlow(START + "?screen=register", null, new Cookie[0]);
        // then
        assertThat(login.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/login?oauthResult=not_registered");
        assertThat(register.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/register?oauthResult=not_registered");
        assertThat(users.count()).isEqualTo(userCount);
        assertThat(identities.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isEmpty();
    }

    @Test
    void ordinaryGoogleStartReplacesAPendingRegistration() throws Exception {
        // given
        final String checkoutToken = paidCheckout("google_replaced", "replaced-google@example.com");
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "replaced-google@example.com", true);
        final MvcResult intent = intent("X-Checkout-Token", checkoutToken).andExpect(status().isNoContent())
                .andReturn();
        // when
        final MvcResult login = completeFlow(START, (MockHttpSession) intent.getRequest().getSession(false),
                new Cookie[0]);
        // then
        assertThat(login.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/login?oauthResult=not_registered");
        assertThat(users.findByUserEmail("replaced-google@example.com")).isEmpty();
    }

    @Test
    void existingUserWithTheCheckoutEmailIsNeverLinkedByEmailEquality() throws Exception {
        // given
        final User existing = users.saveAndFlush(User.localAccount("taken-google@example.com", "hash", null));
        final String checkoutToken = paidCheckout("google_taken", "taken-google@example.com");
        final String subject = "subject-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, "taken-google@example.com", true);
        // when
        final MvcResult callback = registerWithGoogle("X-Checkout-Token", checkoutToken);
        // then
        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/register?oauthResult=conflict");
        assertThat(identities.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isEmpty();
        assertThat(identities.findByUser_UserIdAndProvider(existing.getUserId(), IdentityProvider.GOOGLE)).isEmpty();
        http.perform(get("/api/v1/billing/checkouts/status").header("X-Checkout-Token", checkoutToken))
                .andExpect(jsonPath("$.registrationEligible").value(true));
    }

    @Test
    void googleIdentityAlreadyLinkedToAnotherUserIsNotMovedOrReused() throws Exception {
        // given
        final User owner = users.saveAndFlush(User.googleJustInTime("owner-google@example.com"));
        final String subject = "subject-" + UUID.randomUUID();
        identities.saveAndFlush(UserIdentity.googleIdentity(owner, subject, "owner-google@example.com",
                OffsetDateTime.now()));
        final String checkoutToken = paidCheckout("google_linked", "second-google@example.com");
        GOOGLE.planSuccess(subject, "second-google@example.com", true);
        // when
        final MvcResult callback = registerWithGoogle("X-Checkout-Token", checkoutToken);
        // then
        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(ORIGIN + "/auth/register?oauthResult=conflict");
        assertThat(callback.getResponse().getCookie("refresh_token")).isNull();
        assertThat(users.findByUserEmail("second-google@example.com")).isEmpty();
        assertThat(identities.findByProviderAndSubject(IdentityProvider.GOOGLE, subject).orElseThrow()
                .getUser().getUserId()).isEqualTo(owner.getUserId());
    }

    @Test
    void racingGoogleCallbacksForOneClaimCreateOneUser() throws Exception {
        // given
        final String checkoutToken = paidCheckout("google_race", "race-google@example.com");
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "race-google@example.com", true);
        final StartedFlow first = startRegistration("X-Checkout-Token", checkoutToken);
        GOOGLE.planSuccess("subject-" + UUID.randomUUID(), "race-google@example.com", true);
        final StartedFlow second = startRegistration("X-Checkout-Token", checkoutToken);
        final long userCount = users.count();
        // when
        final List<String> redirects = new ArrayList<>();
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            final CountDownLatch go = new CountDownLatch(1);
            final Future<MvcResult> a = executor.submit(() -> {
                go.await();
                return callback(first);
            });
            final Future<MvcResult> b = executor.submit(() -> {
                go.await();
                return callback(second);
            });
            go.countDown();
            redirects.add(a.get().getResponse().getRedirectedUrl());
            redirects.add(b.get().getResponse().getRedirectedUrl());
        }
        // then
        assertThat(redirects).containsExactlyInAnyOrder(ORIGIN + "/",
                ORIGIN + "/auth/register?oauthResult=registration_used");
        assertThat(users.count()).isEqualTo(userCount + 1);
    }

    private MvcResult registerWithGoogle(final String header, final String token) throws Exception {
        return callback(startRegistration(header, token));
    }

    private StartedFlow startRegistration(final String header, final String token) throws Exception {
        final MvcResult intent = intent(header, token).andExpect(status().isNoContent()).andReturn();
        final MvcResult started = http.perform(get(START + "?screen=register").with(newClient())
                        .session((MockHttpSession) intent.getRequest().getSession(false)))
                .andExpect(status().isFound()).andReturn();
        return new StartedFlow((MockHttpSession) started.getRequest().getSession(),
                started.getResponse().getCookies(), followGoogle(started.getResponse().getRedirectedUrl()));
    }

    private MvcResult completeFlow(final String path, final MockHttpSession session, final Cookie[] cookies)
            throws Exception {
        MockHttpServletRequestBuilder request = get(path).with(newClient());
        if (session != null) {
            request = request.session(session);
        }
        if (cookies.length > 0) {
            request = request.cookie(cookies);
        }
        final MvcResult started = http.perform(request).andExpect(status().isFound()).andReturn();
        return callback(new StartedFlow((MockHttpSession) started.getRequest().getSession(),
                started.getResponse().getCookies(), followGoogle(started.getResponse().getRedirectedUrl())));
    }

    private MvcResult callback(final StartedFlow flow) throws Exception {
        final URI callback = URI.create(flow.callbackUrl());
        MockHttpServletRequestBuilder request = get(callback.getPath()).session(flow.session());
        for (final String pair : callback.getRawQuery().split("&")) {
            final int separator = pair.indexOf('=');
            request = request.param(decode(pair.substring(0, separator)), decode(pair.substring(separator + 1)));
        }
        if (flow.cookies().length > 0) {
            request = request.cookie(flow.cookies());
        }
        return http.perform(request).andReturn();
    }

    private ResultActions intent(final String header, final String token) throws Exception {
        return http.perform(post(INTENT).with(newClient()).with(csrf()).header(header, token));
    }

    private String verificationToken(final String email) {
        final String json = PaidRegistrationFixture.withVerifiedPurchase(jdbc, "{\"email\":\"" + email + "\"}");
        return JsonPath.read(json, "$.verificationToken");
    }

    private String paidCheckout(final String suffix, final String email) throws Exception {
        final String token = start(suffix);
        final Instant periodStart = Instant.now().minusSeconds(60).truncatedTo(ChronoUnit.SECONDS);
        when(stripe.retrievePurchase("cs_" + suffix)).thenReturn(new StripeGateway.Purchase("cs_" + suffix,
                "cus_" + suffix, email, "sub_" + suffix, "active", "in_" + suffix, "paid", "price_weekly",
                periodStart, periodStart.plusSeconds(WEEK_SECONDS), "complete"));
        webhook("evt_" + suffix, "{\"id\":\"cs_" + suffix + "\"}").andExpect(status().isOk());
        return token;
    }

    private String start(final String suffix) throws Exception {
        when(stripe.createCheckout(any(), anyString())).thenReturn(new StripeGateway.CheckoutSession(
                "cs_" + suffix, "https://checkout.stripe.com/c/pay/" + suffix, Instant.now().plusSeconds(3600)));
        final String body = http.perform(post("/api/v1/billing/checkouts").header("Idempotency-Key",
                        UUID.randomUUID())).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.checkoutToken");
    }

    private ResultActions webhook(final String eventId, final String object) throws Exception {
        final String body = "{\"id\":\"" + eventId + "\",\"type\":\"checkout.session.completed\","
                + "\"data\":{\"object\":" + object + "}}";
        final long timestamp = Instant.now().getEpochSecond();
        final Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("whsec_test".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        final String signature = HexFormat.of().formatHex(mac.doFinal(
                (timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
        return http.perform(post("/api/v1/billing/webhook").contentType(MediaType.APPLICATION_JSON)
                .header("Stripe-Signature", "t=" + timestamp + ",v1=" + signature).content(body));
    }

    private static String followGoogle(final String googleLocation) throws Exception {
        final HttpResponse<Void> response = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
                .build().send(HttpRequest.newBuilder(URI.create(googleLocation)).GET().build(),
                        HttpResponse.BodyHandlers.discarding());
        return response.headers().firstValue("location").orElseThrow();
    }

    private static String decode(final String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static RequestPostProcessor newClient() {
        return request -> {
            request.setRemoteAddr("198.18." + (NEXT_CLIENT.get() / 250) + "." + (NEXT_CLIENT.getAndIncrement() % 250 + 1));
            return request;
        };
    }

    private record StartedFlow(MockHttpSession session, Cookie[] cookies, String callbackUrl) { }
}
