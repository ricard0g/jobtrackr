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

    private final AtomicInteger googleStartIp = new AtomicInteger(1);

    @BeforeEach
    void resetGoogle() {
        userIdentityRepository.deleteAll();
        GOOGLE.planSuccess("google-subject", "linked@example.com", true);
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
        final MvcResult result = mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google"))
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
    void unknownGoogleSubject_doesNotCreateAUser() throws Exception {
        final long userCount = userRepository.count();
        GOOGLE.planSuccess("unknown-subject", "unknown@example.com", true);

        final MvcResult callback = completeGoogleSignIn("/api/v1/auth/oauth2/authorization/google");

        assertThat(callback.getResponse().getRedirectedUrl())
                .isEqualTo(PUBLIC_ORIGIN + "/auth/login?oauthResult=failed");
        assertThat(callback.getResponse().getCookie("refresh_token")).isNull();
        assertThat(userRepository.count()).isEqualTo(userCount);
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

    private record StartedFlow(MockHttpSession session, Cookie[] cookies, String googleLocation) {
    }
}
