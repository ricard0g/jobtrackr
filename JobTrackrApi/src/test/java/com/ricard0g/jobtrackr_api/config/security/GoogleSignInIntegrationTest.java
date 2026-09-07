package com.ricard0g.jobtrackr_api.config.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.security.oauth.MockGoogleOidcServer;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthSession;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

import jakarta.servlet.http.Cookie;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "jwt.signing-key=" + GoogleSignInIntegrationTest.SIGNING_KEY,
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket",
        "jobtrackr.google.enabled=true",
        "jobtrackr.google.client-id=test-google-client",
        "jobtrackr.google.client-secret=test-google-secret",
        "jobtrackr.google.public-origin=http://localhost:5173",
        "jobtrackr.google.redirect-uri=http://localhost/api/v1/auth/oauth2/callback/google"
})
class GoogleSignInIntegrationTest {

    static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private static final String PASSWORD = "password123";
    private static final String PUBLIC_ORIGIN = "http://localhost:5173";
    private static final String LINK_INTENT_PATH = "/api/v1/user/sign-in-identities/google/link-intent";
    private static final int CONCURRENT_JIT_ATTEMPTS = 2;
    private static final int CONCURRENT_JIT_TIMEOUT_SECONDS = 10;
    private static final DockerImageName POSTGRES_IMAGE = DockerImageName.parse("postgres:16");
    private static final MockGoogleOidcServer GOOGLE = MockGoogleOidcServer.start();

    @Container
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(POSTGRES_IMAGE);

    @DynamicPropertySource
    static void registerProperties(final DynamicPropertyRegistry registry) {
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
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserIdentityRepository userIdentityRepository;

    @Autowired
    private Environment environment;

    @MockitoBean
    private CvGenerationScheduler cvGenerationScheduler;

    private static final AtomicInteger googleStartIp = new AtomicInteger(1);

    @BeforeEach
    void resetGoogle() {
        userIdentityRepository.deleteAll();
        GOOGLE.planSuccess("google-subject", "linked@example.com", true);
    }

    @Test
    void successfulLinkIntent_createsLinkGoogleSessionAndRequestsAccountChooser() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-intent"));
        final AuthenticatedSession session = loginSession(registered.email());

        final MvcResult intent = mockMvc.perform(post(LINK_INTENT_PATH)
                        .with(remoteAddr(registered.clientIp()))
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkIntentBody(PASSWORD)))
                .andExpect(status().isNoContent())
                .andReturn();

        assertThat(intent.getRequest().getSession(false).getMaxInactiveInterval())
                .isEqualTo(OAuthSession.TIMEOUT_SECONDS);
        assertThat(intent.getRequest().getSession(false).getAttribute(OAuthSession.PURPOSE_ATTRIBUTE))
                .isEqualTo("LINK_GOOGLE");
        assertThat(intent.getRequest().getSession(false).getAttribute(OAuthSession.USER_ID_ATTRIBUTE))
                .isEqualTo(registered.userId().toString());
        assertThat(intent.getRequest().getSession(false).getAttribute(OAuthSession.RETURN_TO_ATTRIBUTE))
                .isEqualTo("/settings/account");
        assertThat(intent.getRequest().getSession(false).getAttribute(OAuthSession.FAILURE_PATH_ATTRIBUTE))
                .isEqualTo("/settings/account");

        final MvcResult started = mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google")
                        .with(remoteAddr(nextGoogleStartIp()))
                        .session((MockHttpSession) intent.getRequest().getSession(false))
                        .cookie(intent.getResponse().getCookies())
                        .cookie(session.refreshCookie()))
                .andExpect(status().isFound())
                .andReturn();

        assertThat(started.getResponse().getRedirectedUrl()).contains("prompt=select_account");
        assertThat(started.getRequest().getSession(false).getAttribute(OAuthSession.PURPOSE_ATTRIBUTE))
                .isEqualTo("LINK_GOOGLE");
        assertThat(started.getRequest().getSession(false).getAttribute(OAuthSession.USER_ID_ATTRIBUTE))
                .isEqualTo(registered.userId().toString());
    }

    @Test
    void googleLinkStart_withoutRefreshCookie_returnsExpiredWithoutRewritingToSignIn() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-start-expired"));
        final AuthenticatedSession session = loginSession(registered.email());
        final MvcResult intent = beginGoogleLinkIntent(registered, session);
        final MockHttpSession oauthSession = (MockHttpSession) intent.getRequest().getSession(false);

        final MvcResult started = mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google")
                        .with(remoteAddr(nextGoogleStartIp()))
                        .session(oauthSession)
                        .cookie(intent.getResponse().getCookies()))
                .andExpect(status().isFound())
                .andReturn();

        assertThat(started.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=expired");
        assertThat(started.getResponse().getRedirectedUrl()).doesNotContain("prompt=select_account");
        assertThat(oauthSession.isInvalid()).isTrue();
    }

    @Test
    void googleLinkStart_withDifferentUserRefresh_returnsExpiredWithoutRewritingToSignIn() throws Exception {
        final RegisteredUser initiator = registerUser(uniqueEmail("link-start-initiator"));
        final RegisteredUser other = registerUser(uniqueEmail("link-start-other"));
        final AuthenticatedSession initiatorSession = loginSession(initiator.email());
        final AuthenticatedSession otherSession = loginSession(other.email());
        final MvcResult intent = beginGoogleLinkIntent(initiator, initiatorSession);

        final MvcResult started = mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google")
                        .with(remoteAddr(nextGoogleStartIp()))
                        .session((MockHttpSession) intent.getRequest().getSession(false))
                        .cookie(mergeCookies(intent.getResponse().getCookies(), otherSession.refreshCookie())))
                .andExpect(status().isFound())
                .andReturn();

        assertThat(started.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=expired");
        assertThat(started.getResponse().getRedirectedUrl()).doesNotContain("prompt=select_account");
    }

    @Test
    void googleLinkStart_withRevokedRefresh_returnsExpiredWithoutRewritingToSignIn() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-start-revoked"));
        final AuthenticatedSession session = loginSession(registered.email());
        final MvcResult intent = beginGoogleLinkIntent(registered, session);
        mockMvc.perform(post("/api/v1/auth/logout")
                        .with(csrf())
                        .cookie(session.refreshCookie()))
                .andExpect(status().isNoContent());

        final MvcResult started = mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google")
                        .with(remoteAddr(nextGoogleStartIp()))
                        .session((MockHttpSession) intent.getRequest().getSession(false))
                        .cookie(mergeCookies(intent.getResponse().getCookies(), session.refreshCookie())))
                .andExpect(status().isFound())
                .andReturn();

        assertThat(started.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=expired");
        assertThat(started.getResponse().getRedirectedUrl()).doesNotContain("prompt=select_account");
    }

    @Test
    void linkIntent_withoutAuthentication_returns401() throws Exception {
        mockMvc.perform(post(LINK_INTENT_PATH)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkIntentBody(PASSWORD)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void linkIntent_withoutCsrfToken_returns403() throws Exception {
        mockMvc.perform(post(LINK_INTENT_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkIntentBody(PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void linkIntent_withWrongPassword_returns401() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("wrong-password"));
        final AuthenticatedSession session = loginSession(registered.email());

        mockMvc.perform(post(LINK_INTENT_PATH)
                        .with(remoteAddr(registered.clientIp()))
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkIntentBody("not-the-password")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void linkIntent_sixthAttemptForSameUserAndIp_returnsRateLimited() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-limit"));
        final AuthenticatedSession session = loginSession(registered.email());

        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post(LINK_INTENT_PATH)
                            .with(remoteAddr("203.0.113.81"))
                            .header("Authorization", bearer(session.accessToken()))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(linkIntentBody("not-the-password")))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post(LINK_INTENT_PATH)
                        .with(remoteAddr("203.0.113.81"))
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkIntentBody(PASSWORD)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void successfulGoogleLink_createsIdentityWithoutChangingSessions() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-success"));
        final AuthenticatedSession session = loginSession(registered.email());
        final int authVersion = userRepository.findById(registered.userId()).orElseThrow().getUserAuthVersion();
        final String subject = "link-subject-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, registered.email().toUpperCase(), true);

        final MvcResult callback = completeGoogleLink(registered, session);

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account");
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain(registered.email());
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain(subject);
        assertThat(callback.getResponse().getCookie("refresh_token")).isNull();
        assertThat(callback.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(callback.getResponse().getHeader("Referrer-Policy")).isEqualTo("no-referrer");

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(session.refreshCookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.userId").value(registered.userId().toString()));
        mockMvc.perform(get("/api/v1/user")
                        .header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(registered.userId().toString()));
        mockMvc.perform(get("/api/v1/user/sign-in-methods")
                        .header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.google.connected").value(true))
                .andExpect(jsonPath("$.google.providerEmail").value(registered.email()))
                .andExpect(jsonPath("$.google.linkedAt").isNotEmpty())
                .andExpect(jsonPath("$.google.lastUsedAt").isNotEmpty())
                .andExpect(jsonPath("$.google.subject").doesNotExist());

        final UserIdentity identity = userIdentityRepository
                .findByProviderAndSubject(IdentityProvider.GOOGLE, subject)
                .orElseThrow();
        assertThat(identity.getUser().getUserId()).isEqualTo(registered.userId());
        assertThat(identity.getLinkedAt()).isEqualTo(identity.getLastUsedAt());
        assertThat(userRepository.findById(registered.userId()).orElseThrow().getUserAuthVersion())
                .isEqualTo(authVersion);
        assertThat(userRepository.findById(registered.userId()).orElseThrow().isUserEmailVerified()).isTrue();
    }

    @Test
    void googleLinkCallback_withoutRefreshCookie_returnsExpiredWithoutLinking() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-expired"));
        final AuthenticatedSession session = loginSession(registered.email());
        final String subject = "expired-link-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, registered.email(), true);

        final StartedFlow started = startGoogleLink(registered, session);
        final MvcResult callback = performCallback(
                followGoogle(started.googleLocation()),
                started.session(),
                started.cookies());

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=expired");
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isEmpty();
    }

    @Test
    void googleLinkCallback_withDifferentUserRefresh_returnsExpiredWithoutLinking() throws Exception {
        final RegisteredUser initiator = registerUser(uniqueEmail("link-initiator"));
        final RegisteredUser other = registerUser(uniqueEmail("link-other"));
        final AuthenticatedSession initiatorSession = loginSession(initiator.email());
        final AuthenticatedSession otherSession = loginSession(other.email());
        final String subject = "wrong-user-link-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, initiator.email(), true);

        final StartedFlow started = startGoogleLink(initiator, initiatorSession);
        final MvcResult callback = performCallback(
                followGoogle(started.googleLocation()),
                started.session(),
                started.cookies(),
                otherSession.refreshCookie());

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=expired");
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isEmpty();
    }

    @Test
    void googleLinkCallback_withRevokedRefresh_returnsExpiredWithoutLinking() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-revoked"));
        final AuthenticatedSession session = loginSession(registered.email());
        final String subject = "revoked-link-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, registered.email(), true);

        final StartedFlow started = startGoogleLink(registered, session);
        mockMvc.perform(post("/api/v1/auth/logout")
                        .with(csrf())
                        .cookie(session.refreshCookie()))
                .andExpect(status().isNoContent());
        final MvcResult callback = performCallback(
                followGoogle(started.googleLocation()),
                started.session(),
                started.cookies(),
                session.refreshCookie());

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=expired");
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isEmpty();
    }

    @Test
    void googleLinkCallback_withMismatchedEmail_isRejectedWithoutLinking() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-mismatch"));
        final AuthenticatedSession session = loginSession(registered.email());
        final String subject = "mismatch-link-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, uniqueEmail("other-google"), true);

        final MvcResult callback = completeGoogleLink(registered, session);

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=mismatch");
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain("@");
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isEmpty();
    }

    @Test
    void googleLink_isRejectedWhenUserAlreadyHasGoogleOrSubjectIsLinkedElsewhere() throws Exception {
        final RegisteredUser existingOwner = registerUser(uniqueEmail("existing-owner"));
        final RegisteredUser alreadyLinked = registerUser(uniqueEmail("already-linked"));
        final RegisteredUser newLinker = registerUser(uniqueEmail("new-linker"));
        final String takenSubject = "taken-subject-" + UUID.randomUUID();
        linkGoogleIdentity(
                existingOwner.userId(),
                takenSubject,
                existingOwner.email(),
                OffsetDateTime.now().minusDays(1));
        linkGoogleIdentity(
                alreadyLinked.userId(),
                "already-subject-" + UUID.randomUUID(),
                alreadyLinked.email(),
                OffsetDateTime.now().minusDays(1));

        GOOGLE.planSuccess("another-subject-" + UUID.randomUUID(), alreadyLinked.email(), true);
        final MvcResult alreadyLinkedCallback = completeGoogleLink(alreadyLinked, loginSession(alreadyLinked.email()));
        assertThat(alreadyLinkedCallback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=failed");
        assertThat(userIdentityRepository.findByUser_UserIdAndProvider(
                alreadyLinked.userId(), IdentityProvider.GOOGLE)).isPresent();

        GOOGLE.planSuccess(takenSubject, newLinker.email(), true);
        final MvcResult takenSubjectCallback = completeGoogleLink(newLinker, loginSession(newLinker.email()));
        assertThat(takenSubjectCallback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account?oauthResult=failed");
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, takenSubject)
                .orElseThrow()
                .getUser()
                .getUserId()).isEqualTo(existingOwner.userId());
    }

    @Test
    void concurrentGoogleLinkAttempts_createAtMostOneIdentity() throws Exception {
        final RegisteredUser registered = registerUser(uniqueEmail("link-race"));
        final AuthenticatedSession firstSession = loginSession(registered.email());
        final AuthenticatedSession secondSession = loginSession(registered.email());
        final String subject = "race-link-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, registered.email(), true);
        final long identityCount = userIdentityRepository.count();
        final ExecutorService executor = Executors.newFixedThreadPool(CONCURRENT_JIT_ATTEMPTS);
        final CountDownLatch start = new CountDownLatch(1);

        try {
            final Future<MvcResult> first = executor.submit(() -> {
                start.await();
                return completeGoogleLink(registered, firstSession);
            });
            final Future<MvcResult> second = executor.submit(() -> {
                start.await();
                return completeGoogleLink(registered, secondSession);
            });
            start.countDown();
            final MvcResult firstCallback = first.get(CONCURRENT_JIT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            final MvcResult secondCallback = second.get(CONCURRENT_JIT_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            assertThat(firstCallback.getResponse().getRedirectedUrl()).isEqualTo(PUBLIC_ORIGIN + "/settings/account");
            assertThat(secondCallback.getResponse().getRedirectedUrl()).isEqualTo(PUBLIC_ORIGIN + "/settings/account");
            assertThat(firstCallback.getResponse().getCookie("refresh_token")).isNull();
            assertThat(secondCallback.getResponse().getCookie("refresh_token")).isNull();
        } finally {
            executor.shutdownNow();
        }

        assertThat(userIdentityRepository.count()).isEqualTo(identityCount + 1);
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isPresent();
    }

    @Test
    void providers_shouldReportGoogleEnabledWithoutExposingCredentials() throws Exception {
        mockMvc.perform(get("/api/v1/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.google").value(true))
                .andExpect(jsonPath("$.clientId").doesNotExist());
    }

    @Test
    void googleStart_shouldCreateHostOnlyPurposeBoundOauthCookieAndRequestAccountChooser() throws Exception {
        final MvcResult result = mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google")
                        .with(remoteAddr(nextGoogleStartIp())))
                .andExpect(status().isFound())
                .andReturn();

        final String location = result.getResponse().getRedirectedUrl();
        assertThat(location).contains("prompt=select_account");
        assertThat(location).contains("openid");
        assertThat(location).contains("email");
        assertThat(location).doesNotContain("profile");

        assertThat(environment.getProperty("server.servlet.session.cookie.name"))
                .isEqualTo(OAuthSession.COOKIE_NAME);
        assertThat(environment.getProperty("server.servlet.session.cookie.path"))
                .isEqualTo(OAuthSession.COOKIE_PATH);
        assertThat(environment.getProperty("server.servlet.session.cookie.http-only")).isEqualTo("true");
        assertThat(environment.getProperty("server.servlet.session.cookie.same-site")).isEqualTo("lax");
        assertThat(environment.getProperty("server.servlet.session.cookie.domain")).isNull();
        assertThat(result.getRequest().getSession(false).getMaxInactiveInterval())
                .isEqualTo(OAuthSession.TIMEOUT_SECONDS);
        assertThat(result.getRequest().getSession(false).getAttribute(OAuthSession.PURPOSE_ATTRIBUTE))
                .isEqualTo("SIGN_IN");
    }

    @Test
    void returningGoogleSignIn_createsJobTrackrSessionWithoutTokensInTheUrl() throws Exception {
        final RegisteredUser registered = registerUser("linked@example.com");
        final OffsetDateTime linkedAt = OffsetDateTime.now().minusDays(2);
        linkGoogleIdentity(registered.userId(), "google-subject", "old-google@example.com", linkedAt);
        GOOGLE.planSuccess("google-subject", "new-google@example.com", true);

        final MvcResult callback = completeGoogleSignIn("/api/v1/auth/oauth2/authorization/google");

        assertThat(callback.getResponse().getRedirectedUrl()).isEqualTo(PUBLIC_ORIGIN + "/");
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain("accessToken");
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain("id_token");
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain("code=");
        assertThat(callback.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(callback.getResponse().getHeader("Referrer-Policy")).isEqualTo("no-referrer");

        final Cookie refreshCookie = callback.getResponse().getCookie("refresh_token");
        assertThat(refreshCookie).isNotNull();
        final MvcResult refreshed = mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(refreshCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.userId").value(registered.userId().toString()))
                .andExpect(jsonPath("$.user.userEmail").value("linked@example.com"))
                .andReturn();
        mockMvc.perform(get("/api/v1/user")
                        .header("Authorization", "Bearer " + JsonPath.read(
                                refreshed.getResponse().getContentAsString(),
                                "$.accessToken")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(registered.userId().toString()));

        final UserIdentity identity = userIdentityRepository
                .findByProviderAndSubject(IdentityProvider.GOOGLE, "google-subject")
                .orElseThrow();
        assertThat(identity.getLinkedAt().toInstant().truncatedTo(ChronoUnit.MILLIS))
                .isEqualTo(linkedAt.toInstant().truncatedTo(ChronoUnit.MILLIS));
        assertThat(identity.getLastUsedAt()).isAfter(linkedAt);
        assertThat(identity.getProviderEmail()).isEqualToIgnoringCase("new-google@example.com");
        assertThat(userRepository.findById(registered.userId()).orElseThrow().getUserEmail())
                .isEqualTo("linked@example.com");
    }

    @Test
    void unknownGoogleSubject_createsExactlyOneUserAndIdentityWhenEmailIsUnused() throws Exception {
        final String email = uniqueEmail("jit");
        final String subject = "jit-subject-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, email, true);
        final long userCount = userRepository.count();
        final long identityCount = userIdentityRepository.count();

        final MvcResult callback = completeGoogleSignIn("/api/v1/auth/oauth2/authorization/google");

        assertThat(callback.getResponse().getRedirectedUrl()).isEqualTo(PUBLIC_ORIGIN + "/");
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain(email);
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain(subject);
        final Cookie refreshCookie = callback.getResponse().getCookie("refresh_token");
        assertThat(refreshCookie).isNotNull();

        final MvcResult refreshed = mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(refreshCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.userEmail").value(email))
                .andExpect(jsonPath("$.user.userDisplayName").isEmpty())
                .andReturn();
        final String userId = JsonPath.read(refreshed.getResponse().getContentAsString(), "$.user.userId");

        assertThat(userRepository.count()).isEqualTo(userCount + 1);
        assertThat(userIdentityRepository.count()).isEqualTo(identityCount + 1);
        final User created = userRepository.findById(UUID.fromString(userId)).orElseThrow();
        assertThat(created.getUserEmail()).isEqualTo(email);
        assertThat(created.getUserPasswordHash()).isNull();
        assertThat(created.getUserDisplayName()).isNull();
        assertThat(created.isUserEmailVerified()).isTrue();
        final UserIdentity identity = userIdentityRepository
                .findByProviderAndSubject(IdentityProvider.GOOGLE, subject)
                .orElseThrow();
        assertThat(identity.getUser().getUserId()).isEqualTo(created.getUserId());
        assertThat(identity.getProviderEmail()).isEqualToIgnoringCase(email);
    }

    @Test
    void unknownGoogleSubject_withExistingPrimaryEmail_isRejectedWithoutLinking() throws Exception {
        final RegisteredUser registered = registerUser("Taken@example.com");
        final User existing = userRepository.findById(registered.userId()).orElseThrow();
        existing.setUserEmailVerified(true);
        userRepository.save(existing);
        final String subject = "collision-subject-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, "taken@example.com", true);
        final long userCount = userRepository.count();
        final long identityCount = userIdentityRepository.count();

        final MvcResult callback = completeGoogleSignIn(
                "/api/v1/auth/oauth2/authorization/google?screen=register");

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/auth/register?oauthResult=conflict");
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain("taken@example.com");
        assertThat(callback.getResponse().getRedirectedUrl()).doesNotContain(subject);
        assertThat(callback.getResponse().getCookie("refresh_token")).isNull();
        assertThat(userRepository.count()).isEqualTo(userCount);
        assertThat(userIdentityRepository.count()).isEqualTo(identityCount);
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isEmpty();
        assertThat(userRepository.findById(registered.userId()).orElseThrow().getUserEmail())
                .isEqualToIgnoringCase("taken@example.com");
    }

    @Test
    void incompleteGoogleIdentity_failsClosedWithoutCreatingAUser() throws Exception {
        assertIncompleteGoogleIdentityFailsClosed(() -> GOOGLE.planMissingEmail());
        assertIncompleteGoogleIdentityFailsClosed(
                () -> GOOGLE.planSuccess("unverified-subject", uniqueEmail("unverified"), false));
        assertIncompleteGoogleIdentityFailsClosed(
                () -> GOOGLE.planMissingSubject(uniqueEmail("missing-sub")));
    }

    @Test
    void concurrentCallbacksForTheSameNewIdentity_createOneUserAndOneIdentity() throws Exception {
        final String email = uniqueEmail("race");
        final String subject = "race-subject-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, email, true);
        final long userCount = userRepository.count();
        final long identityCount = userIdentityRepository.count();
        final ExecutorService executor = Executors.newFixedThreadPool(CONCURRENT_JIT_ATTEMPTS);
        final CountDownLatch start = new CountDownLatch(1);

        try {
            final Future<MvcResult> first = executor.submit(() -> {
                start.await();
                return completeGoogleSignIn("/api/v1/auth/oauth2/authorization/google");
            });
            final Future<MvcResult> second = executor.submit(() -> {
                start.await();
                return completeGoogleSignIn("/api/v1/auth/oauth2/authorization/google");
            });
            start.countDown();
            final MvcResult firstCallback = first.get(CONCURRENT_JIT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            final MvcResult secondCallback = second.get(CONCURRENT_JIT_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            assertThat(firstCallback.getResponse().getRedirectedUrl()).isEqualTo(PUBLIC_ORIGIN + "/");
            assertThat(secondCallback.getResponse().getRedirectedUrl()).isEqualTo(PUBLIC_ORIGIN + "/");
            assertThat(firstCallback.getResponse().getCookie("refresh_token")).isNotNull();
            assertThat(secondCallback.getResponse().getCookie("refresh_token")).isNotNull();
            assertThat(firstCallback.getResponse().getRedirectedUrl()).doesNotContain(email);
            assertThat(secondCallback.getResponse().getRedirectedUrl()).doesNotContain(subject);
        } finally {
            executor.shutdownNow();
        }

        assertThat(userRepository.count()).isEqualTo(userCount + 1);
        assertThat(userIdentityRepository.count()).isEqualTo(identityCount + 1);
        final UserIdentity identity = userIdentityRepository
                .findByProviderAndSubject(IdentityProvider.GOOGLE, subject)
                .orElseThrow();
        assertThat(identity.getUser().getUserEmail()).isEqualToIgnoringCase(email);
        assertThat(userRepository.findByUserEmail(email)).isPresent();
    }

    @Test
    void disabledLinkedUser_isRejectedWithoutMovingTheIdentity() throws Exception {
        assertUnavailableUserIsRejected(user -> user.setUserEnabled(false));
    }

    @Test
    void lockedLinkedUser_isRejectedWithoutMovingTheIdentity() throws Exception {
        assertUnavailableUserIsRejected(user -> user.setUserLocked(true));
    }

    @Test
    void softDeletedLinkedUser_isRejectedWithoutMovingTheIdentity() throws Exception {
        assertUnavailableUserIsRejected(user -> user.setUserDeletedAt(OffsetDateTime.now()));
    }

    @Test
    void cancelledGoogleConsent_returnsAllowlistedCancelledResult() throws Exception {
        GOOGLE.planAccessDenied();

        final MvcResult callback = completeGoogleSignIn(
                "/api/v1/auth/oauth2/authorization/google?screen=register");

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/auth/register?oauthResult=cancelled");
        assertThat(callback.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
    }

    @Test
    void replacedOauthStart_expiresTheEarlierCallback() throws Exception {
        final RegisteredUser registered = registerUser("replaced@example.com");
        linkGoogleIdentity(
                registered.userId(),
                "google-subject",
                "replaced@example.com",
                OffsetDateTime.now().minusDays(1));

        final StartedFlow firstStart = startGoogle("/api/v1/auth/oauth2/authorization/google");
        final String firstCallback = followGoogle(firstStart.googleLocation());

        final StartedFlow secondStart = startGoogle(
                "/api/v1/auth/oauth2/authorization/google",
                firstStart.session(),
                firstStart.cookies());

        final MvcResult expiredCallback = performCallback(
                firstCallback,
                firstStart.session(),
                firstStart.cookies());
        assertThat(expiredCallback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/auth/login?oauthResult=expired");

        GOOGLE.planSuccess("google-subject", "replaced@example.com", true);
        final MvcResult success = performCallback(
                followGoogle(secondStart.googleLocation()),
                secondStart.session(),
                secondStart.cookies());
        assertThat(success.getResponse().getRedirectedUrl()).isEqualTo(PUBLIC_ORIGIN + "/");
        assertThat(success.getResponse().getCookie("refresh_token")).isNotNull();
    }

    @Test
    void googleStart_twentyFirstAttemptFromSameIp_returnsRateLimited() throws Exception {
        for (int attempt = 0; attempt < 20; attempt++) {
            mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google")
                            .with(remoteAddr("203.0.113.20")))
                    .andExpect(status().isFound());
        }

        mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google")
                        .with(remoteAddr("203.0.113.20")))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void providerSubjectAndUserProviderConstraints_areEnforced() throws Exception {
        final RegisteredUser first = registerUser("one@example.com");
        final RegisteredUser second = registerUser("two@example.com");
        final OffsetDateTime linkedAt = OffsetDateTime.now();
        linkGoogleIdentity(first.userId(), "shared-subject", "one@example.com", linkedAt);

        assertThatThrownBy(() -> linkGoogleIdentity(
                second.userId(),
                "shared-subject",
                "two@example.com",
                linkedAt))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> linkGoogleIdentity(
                first.userId(),
                "another-subject",
                "one@example.com",
                linkedAt))
                .isInstanceOf(DataIntegrityViolationException.class);

        linkGoogleIdentity(second.userId(), "CaseSensitiveSubject", "two@example.com", linkedAt);
        final RegisteredUser third = registerUser("three@example.com");
        linkGoogleIdentity(third.userId(), "casesensitivesubject", "three@example.com", linkedAt);
    }

    @Test
    void alreadyAuthenticatedDifferentUser_isNotReplaced() throws Exception {
        final RegisteredUser googleUser = registerUser("google-owner@example.com");
        final RegisteredUser passwordUser = registerUser("password-owner@example.com");
        final OffsetDateTime linkedAt = OffsetDateTime.now().minusDays(1);
        linkGoogleIdentity(
                googleUser.userId(),
                "google-subject",
                "google-owner@example.com",
                linkedAt);
        GOOGLE.planSuccess("google-subject", "stolen-google@example.com", true);

        final Cookie passwordRefresh = login(passwordUser.email()).getResponse().getCookie("refresh_token");
        final StartedFlow started = startGoogle("/api/v1/auth/oauth2/authorization/google");
        final MvcResult callback = performCallback(
                followGoogle(started.googleLocation()),
                started.session(),
                started.cookies(),
                passwordRefresh);

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/auth/login?oauthResult=failed");
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(passwordRefresh))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.userId").value(passwordUser.userId().toString()));

        final UserIdentity identity = userIdentityRepository
                .findByProviderAndSubject(IdentityProvider.GOOGLE, "google-subject")
                .orElseThrow();
        assertThat(identity.getUser().getUserId()).isEqualTo(googleUser.userId());
        assertThat(identity.getLastUsedAt().toInstant().truncatedTo(ChronoUnit.MILLIS))
                .isEqualTo(linkedAt.toInstant().truncatedTo(ChronoUnit.MILLIS));
        assertThat(identity.getProviderEmail()).isEqualToIgnoringCase("google-owner@example.com");
    }

    @Test
    void alreadyAuthenticatedDifferentUser_doesNotCreateJustInTimeUser() throws Exception {
        // given
        final RegisteredUser passwordUser = registerUser("password-owner-jit@example.com");
        final String email = uniqueEmail("jit-blocked");
        final String subject = "jit-blocked-subject-" + UUID.randomUUID();
        GOOGLE.planSuccess(subject, email, true);
        final long userCount = userRepository.count();
        final long identityCount = userIdentityRepository.count();
        final Cookie passwordRefresh = login(passwordUser.email()).getResponse().getCookie("refresh_token");

        // when
        final StartedFlow started = startGoogle("/api/v1/auth/oauth2/authorization/google");
        final MvcResult callback = performCallback(
                followGoogle(started.googleLocation()),
                started.session(),
                started.cookies(),
                passwordRefresh);

        // then
        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/auth/login?oauthResult=failed");
        assertThat(callback.getResponse().getCookie("refresh_token")).isNull();
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(passwordRefresh))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.userId").value(passwordUser.userId().toString()));
        assertThat(userRepository.count()).isEqualTo(userCount);
        assertThat(userIdentityRepository.count()).isEqualTo(identityCount);
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, subject)).isEmpty();
        assertThat(userRepository.findByUserEmail(email)).isEmpty();
    }

    @Test
    void callbackReturnTo_usesAllowlistedInternalDestinationOnly() throws Exception {
        final RegisteredUser registered = registerUser("return-to@example.com");
        linkGoogleIdentity(
                registered.userId(),
                "google-subject",
                "return-to@example.com",
                OffsetDateTime.now().minusDays(1));
        GOOGLE.planSuccess("google-subject", "return-to@example.com", true);

        final MvcResult allowed = completeGoogleSignIn(
                "/api/v1/auth/oauth2/authorization/google?returnTo=/settings/account");
        assertThat(allowed.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/settings/account");

        GOOGLE.planSuccess("google-subject", "return-to@example.com", true);
        final MvcResult rejected = completeGoogleSignIn(
                "/api/v1/auth/oauth2/authorization/google?returnTo=https://evil.example");
        assertThat(rejected.getResponse().getRedirectedUrl()).isEqualTo(PUBLIC_ORIGIN + "/");
    }

    private void assertUnavailableUserIsRejected(final java.util.function.Consumer<User> mutator) throws Exception {
        final RegisteredUser registered = registerUser(UUID.randomUUID() + "@example.com");
        linkGoogleIdentity(
                registered.userId(),
                "google-subject",
                registered.email(),
                OffsetDateTime.now().minusDays(1));
        final User user = userRepository.findById(registered.userId()).orElseThrow();
        mutator.accept(user);
        userRepository.save(user);
        GOOGLE.planSuccess("google-subject", registered.email(), true);
        final long userCount = userRepository.count();

        final MvcResult callback = completeGoogleSignIn("/api/v1/auth/oauth2/authorization/google");

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/auth/login?oauthResult=failed");
        assertThat(callback.getResponse().getCookie("refresh_token")).isNull();
        assertThat(userRepository.count()).isEqualTo(userCount);
        final UserIdentity identity = userIdentityRepository
                .findByProviderAndSubject(IdentityProvider.GOOGLE, "google-subject")
                .orElseThrow();
        assertThat(identity.getUser().getUserId()).isEqualTo(registered.userId());
    }

    private void assertIncompleteGoogleIdentityFailsClosed(final Runnable planner) throws Exception {
        userIdentityRepository.deleteAll();
        planner.run();
        final long userCount = userRepository.count();
        final long identityCount = userIdentityRepository.count();

        final MvcResult callback = completeGoogleSignIn("/api/v1/auth/oauth2/authorization/google");

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/auth/login?oauthResult=failed");
        assertThat(callback.getResponse().getCookie("refresh_token")).isNull();
        assertThat(userRepository.count()).isEqualTo(userCount);
        assertThat(userIdentityRepository.count()).isEqualTo(identityCount);
    }

    private MvcResult completeGoogleSignIn(final String startPath) throws Exception {
        final StartedFlow started = startGoogle(startPath);
        return performCallback(
                followGoogle(started.googleLocation()),
                started.session(),
                started.cookies());
    }

    private StartedFlow startGoogle(final String startPath) throws Exception {
        return startGoogle(startPath, null, new Cookie[0]);
    }

    private StartedFlow startGoogle(
            final String startPath,
            final MockHttpSession session,
            final Cookie[] cookies) throws Exception {
        MockHttpServletRequestBuilder request = get(startPath)
                .with(remoteAddr(nextGoogleStartIp()));
        if (session != null) {
            request = request.session(session);
        }
        if (cookies.length > 0) {
            request = request.cookie(cookies);
        }
        final MvcResult started = mockMvc.perform(request)
                .andExpect(status().isFound())
                .andReturn();
        return new StartedFlow(
                (MockHttpSession) started.getRequest().getSession(),
                started.getResponse().getCookies(),
                started.getResponse().getRedirectedUrl());
    }

    private MvcResult completeGoogleLink(
            final RegisteredUser registered,
            final AuthenticatedSession session) throws Exception {
        final StartedFlow started = startGoogleLink(registered, session);
        return performCallback(
                followGoogle(started.googleLocation()),
                started.session(),
                started.cookies(),
                session.refreshCookie());
    }

    private StartedFlow startGoogleLink(
            final RegisteredUser registered,
            final AuthenticatedSession session) throws Exception {
        final MvcResult intent = beginGoogleLinkIntent(registered, session);
        return startGoogle(
                "/api/v1/auth/oauth2/authorization/google?returnTo=/settings/account",
                (MockHttpSession) intent.getRequest().getSession(false),
                mergeCookies(intent.getResponse().getCookies(), session.refreshCookie()));
    }

    private MvcResult beginGoogleLinkIntent(
            final RegisteredUser registered,
            final AuthenticatedSession session) throws Exception {
        return mockMvc.perform(post(LINK_INTENT_PATH)
                        .with(remoteAddr(registered.clientIp()))
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(linkIntentBody(PASSWORD)))
                .andExpect(status().isNoContent())
                .andReturn();
    }

    private static Cookie[] mergeCookies(final Cookie[] cookies, final Cookie extra) {
        final Cookie[] merged = java.util.Arrays.copyOf(cookies, cookies.length + 1);
        merged[cookies.length] = extra;
        return merged;
    }

    private MvcResult performCallback(
            final String callbackUrl,
            final MockHttpSession session,
            final Cookie[] cookies) throws Exception {
        return performCallback(callbackUrl, session, cookies, null);
    }

    private MvcResult performCallback(
            final String callbackUrl,
            final MockHttpSession session,
            final Cookie[] cookies,
            final Cookie refreshCookie) throws Exception {
        final URI callback = URI.create(callbackUrl);
        MockHttpServletRequestBuilder request = get(callback.getPath());
        final String rawQuery = callback.getRawQuery();
        if (rawQuery != null && !rawQuery.isBlank()) {
            for (final String pair : rawQuery.split("&")) {
                final int separator = pair.indexOf('=');
                if (separator < 0) {
                    request = request.param(urlDecode(pair), "");
                    continue;
                }
                request = request.param(
                        urlDecode(pair.substring(0, separator)),
                        urlDecode(pair.substring(separator + 1)));
            }
        }
        if (session != null) {
            request = request.session(session);
        }
        if (cookies.length > 0) {
            request = request.cookie(cookies);
        }
        if (refreshCookie != null) {
            request = request.cookie(refreshCookie);
        }
        return mockMvc.perform(request).andReturn();
    }

    private String nextGoogleStartIp() {
        return "192.0.2." + googleStartIp.getAndUpdate(current -> current == 254 ? 1 : current + 1);
    }

    private static String urlDecode(final String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static String followGoogle(final String googleLocation) throws Exception {
        final HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        final HttpResponse<Void> response = client.send(
                HttpRequest.newBuilder(URI.create(googleLocation)).GET().build(),
                HttpResponse.BodyHandlers.discarding());
        return response.headers().firstValue("location").orElseThrow();
    }

    private static String uniqueEmail(final String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@example.com";
    }

    private RegisteredUser registerUser(final String email) throws Exception {
        final String clientIp = "198.51.100." + (Math.floorMod(email.hashCode(), 200) + 1);
        final MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .with(remoteAddr(clientIp))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "%s",
                                  "password": "%s",
                                  "displayName": "Google User"
                                }
                                """.formatted(email, PASSWORD)))
                .andExpect(status().isCreated())
                .andReturn();
        final UUID userId = UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.user.userId"));
        return new RegisteredUser(userId, email, clientIp);
    }

    private MvcResult login(final String email) throws Exception {
        return mockMvc.perform(post("/api/v1/auth/login")
                        .with(remoteAddr("203.0.113." + (Math.floorMod(email.hashCode(), 200) + 1)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "%s",
                                  "password": "%s"
                                }
                                """.formatted(email, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();
    }

    private AuthenticatedSession loginSession(final String email) throws Exception {
        final MvcResult result = login(email);
        return new AuthenticatedSession(
                JsonPath.read(result.getResponse().getContentAsString(), "$.accessToken"),
                result.getResponse().getCookie("refresh_token"));
    }

    private static String bearer(final String accessToken) {
        return "Bearer " + accessToken;
    }

    private static String linkIntentBody(final String currentPassword) {
        return """
                {
                  "currentPassword": "%s"
                }
                """.formatted(currentPassword);
    }

    private void linkGoogleIdentity(
            final UUID userId,
            final String subject,
            final String providerEmail,
            final OffsetDateTime linkedAt) {
        final User user = userRepository.findById(userId).orElseThrow();
        userIdentityRepository.saveAndFlush(UserIdentity.googleIdentity(user, subject, providerEmail, linkedAt));
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor remoteAddr(final String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }

    private record RegisteredUser(UUID userId, String email, String clientIp) {
    }

    private record AuthenticatedSession(String accessToken, Cookie refreshCookie) {
    }

    private record StartedFlow(MockHttpSession session, Cookie[] cookies, String googleLocation) {
    }
}
