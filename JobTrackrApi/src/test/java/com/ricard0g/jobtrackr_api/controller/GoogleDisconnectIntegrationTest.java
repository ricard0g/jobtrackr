package com.ricard0g.jobtrackr_api.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.service.AuthService;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.Cookie;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "jwt.signing-key=" + GoogleDisconnectIntegrationTest.SIGNING_KEY,
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket"
})
class GoogleDisconnectIntegrationTest {

    static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private static final String DISCONNECT_PATH = "/api/v1/user/sign-in-identities/google/disconnect";
    private static final String PASSWORD = "password123";
    private static final String AUTHENTICATION_VERSION_CLAIM = "auth_version";
    private static final DockerImageName POSTGRES_IMAGE = DockerImageName.parse("postgres:16");

    @Container
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(POSTGRES_IMAGE);

    @DynamicPropertySource
    static void registerDatasourceProperties(final DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserIdentityRepository userIdentityRepository;

    @Autowired
    private AuthService authService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @MockitoBean
    private CvGenerationScheduler cvGenerationScheduler;

    @Test
    void disconnect_withoutAuthentication_returns401() throws Exception {
        mockMvc.perform(post(DISCONNECT_PATH)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(disconnectBody(PASSWORD)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void disconnect_withoutCsrfToken_returns403() throws Exception {
        mockMvc.perform(post(DISCONNECT_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(disconnectBody(PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void lastMethodProtection_refusesDisconnectWhenPasswordSignInIsUnavailable() throws Exception {
        // given
        final IssuedSession session = googleOnlySession();

        // when / then
        mockMvc.perform(post(DISCONNECT_PATH)
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(disconnectBody(PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("GOOGLE_DISCONNECT_NOT_ALLOWED"));

        assertThat(userIdentityRepository.findByUser_UserIdAndProvider(session.userId(), IdentityProvider.GOOGLE))
                .isPresent();
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(session.refreshCookie()))
                .andExpect(status().isOk());
    }

    @Test
    void wrongCurrentPassword_isRejectedWithoutRemovingTheIdentity() throws Exception {
        // given
        final LinkedSession session = linkedPasswordSession();

        // when / then
        mockMvc.perform(post(DISCONNECT_PATH)
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(disconnectBody("wrong-password")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, session.subject()))
                .isPresent();
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(session.refreshCookie()))
                .andExpect(status().isOk());
    }

    @Test
    void successfulDisconnect_removesTheIdentityAndAdoptsAFreshSession() throws Exception {
        // given
        final LinkedSession session = linkedPasswordSession();
        final LinkedSession otherDevice = loginLinkedSession(session.email(), session.subject());

        // when
        final MvcResult disconnectResult = mockMvc.perform(post(DISCONNECT_PATH)
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(disconnectBody(PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.userId").value(session.userId().toString()))
                .andExpect(cookie().exists("refresh_token"))
                .andReturn();
        final Cookie freshRefresh = disconnectResult.getResponse().getCookie("refresh_token");
        final String freshAccess = JsonPath.read(disconnectResult.getResponse().getContentAsString(), "$.accessToken");
        assertThat(freshRefresh).isNotNull();

        // then
        assertThat(freshAccess).isNotEqualTo(session.accessToken());
        assertThat(freshRefresh.getValue()).isNotEqualTo(session.refreshCookie().getValue());
        assertThat(authenticationVersion(freshAccess)).isEqualTo(1);
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, session.subject()))
                .isEmpty();
        assertThat(userIdentityRepository.findByUser_UserIdAndProvider(session.userId(), IdentityProvider.GOOGLE))
                .isEmpty();

        mockMvc.perform(get("/api/v1/user/sign-in-methods").header("Authorization", bearer(freshAccess)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.password.enabled").value(true))
                .andExpect(jsonPath("$.google.connected").value(false))
                .andExpect(jsonPath("$.google.providerEmail").value(nullValue()))
                .andExpect(jsonPath("$.google.linkedAt").value(nullValue()))
                .andExpect(jsonPath("$.google.lastUsedAt").value(nullValue()));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(otherDevice.accessToken())))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(session.refreshCookie()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(otherDevice.refreshCookie()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(freshRefresh))
                .andExpect(status().isOk());

        final User user = userRepository.findById(session.userId()).orElseThrow();
        userIdentityRepository.saveAndFlush(UserIdentity.googleIdentity(
                user,
                session.subject(),
                session.email(),
                OffsetDateTime.parse("2026-03-01T12:00:00Z")));
        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, session.subject()))
                .isPresent();
    }

    @Test
    void disconnectWithoutGoogle_doesNotRevokeSessions() throws Exception {
        // given
        final LinkedSession session = passwordOnlySession();

        // when / then
        mockMvc.perform(post(DISCONNECT_PATH)
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(disconnectBody(PASSWORD)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GOOGLE_IDENTITY_NOT_CONNECTED"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(session.refreshCookie()))
                .andExpect(status().isOk());
    }

    @Test
    void sixthProtectedDisconnectAttemptForSameUserAndIp_isRateLimitedBeforeMutation() throws Exception {
        // given
        final LinkedSession session = linkedPasswordSession();
        final String clientIp = uniqueIp();

        // when / then
        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post(DISCONNECT_PATH)
                            .with(remoteAddr(clientIp))
                            .header("Authorization", bearer(session.accessToken()))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(disconnectBody("wrong-password")))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post(DISCONNECT_PATH)
                        .with(remoteAddr(clientIp))
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(disconnectBody(PASSWORD)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));

        assertThat(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, session.subject()))
                .isPresent();
    }

    private IssuedSession googleOnlySession() {
        final String email = uniqueEmail("google-only");
        final String subject = "google-subject-" + UUID.randomUUID();
        final User user = userRepository.saveAndFlush(User.googleJustInTime(email));
        userIdentityRepository.saveAndFlush(UserIdentity.googleIdentity(
                user,
                subject,
                email,
                OffsetDateTime.parse("2026-01-15T10:00:00Z")));
        final AuthService.AuthTokenPair tokenPair = authService.issueSession(user);
        return new IssuedSession(
                user.getUserId(),
                tokenPair.authResponse().accessToken(),
                new Cookie("refresh_token", tokenPair.refreshToken()));
    }

    private LinkedSession linkedPasswordSession() throws Exception {
        final String email = uniqueEmail("linked");
        final MvcResult result = register(email)
                .andExpect(status().isCreated())
                .andReturn();
        final UUID userId = UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.user.userId"));
        final String accessToken = JsonPath.read(result.getResponse().getContentAsString(), "$.accessToken");
        final Cookie refreshCookie = result.getResponse().getCookie("refresh_token");
        assertThat(refreshCookie).isNotNull();
        final String subject = "google-subject-" + UUID.randomUUID();
        final User user = userRepository.findById(userId).orElseThrow();
        userIdentityRepository.saveAndFlush(UserIdentity.googleIdentity(
                user,
                subject,
                email,
                OffsetDateTime.parse("2026-01-15T10:00:00Z")));
        return new LinkedSession(userId, email, subject, accessToken, refreshCookie);
    }

    private LinkedSession passwordOnlySession() throws Exception {
        final String email = uniqueEmail("password-only");
        final MvcResult result = register(email)
                .andExpect(status().isCreated())
                .andReturn();
        final UUID userId = UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.user.userId"));
        final String accessToken = JsonPath.read(result.getResponse().getContentAsString(), "$.accessToken");
        final Cookie refreshCookie = result.getResponse().getCookie("refresh_token");
        assertThat(refreshCookie).isNotNull();
        return new LinkedSession(userId, email, null, accessToken, refreshCookie);
    }

    private LinkedSession loginLinkedSession(final String email, final String subject) throws Exception {
        final ObjectNode body = objectMapper.createObjectNode();
        body.put("email", email);
        body.put("password", PASSWORD);
        final MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn();
        final UUID userId = UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.user.userId"));
        final String accessToken = JsonPath.read(result.getResponse().getContentAsString(), "$.accessToken");
        final Cookie refreshCookie = result.getResponse().getCookie("refresh_token");
        assertThat(refreshCookie).isNotNull();
        return new LinkedSession(userId, email, subject, accessToken, refreshCookie);
    }

    private ResultActions register(final String email) throws Exception {
        final ObjectNode body = objectMapper.createObjectNode();
        body.put("email", email);
        body.put("password", PASSWORD);
        body.put("displayName", "Linked User");
        return mockMvc.perform(post("/api/v1/auth/register")
                .with(remoteAddr(uniqueIp()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor remoteAddr(final String clientIp) {
        return request -> {
            request.setRemoteAddr(clientIp);
            return request;
        };
    }

    private static String uniqueIp() {
        return "2001:db8::" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private static int authenticationVersion(final String accessToken) {
        final SecretKey signingKey = Keys.hmacShaKeyFor(SIGNING_KEY.getBytes());
        final Integer version = Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(accessToken)
                .getPayload()
                .get(AUTHENTICATION_VERSION_CLAIM, Integer.class);
        assertThat(version).isNotNull();
        return version;
    }

    private static String bearer(final String accessToken) {
        return "Bearer " + accessToken;
    }

    private static String uniqueEmail(final String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@example.com";
    }

    private static String disconnectBody(final String currentPassword) {
        return """
                {
                  "currentPassword": "%s"
                }
                """.formatted(currentPassword);
    }

    private record IssuedSession(UUID userId, String accessToken, Cookie refreshCookie) {
    }

    private record LinkedSession(
            UUID userId,
            String email,
            String subject,
            String accessToken,
            Cookie refreshCookie) {
    }
}
