package com.ricard0g.jobtrackr_api.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.model.User;
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
        "jwt.signing-key=" + UserPasswordChangeIntegrationTest.SIGNING_KEY,
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket"
})
class UserPasswordChangeIntegrationTest {

    static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private static final String PASSWORD = "password123";
    private static final String NEW_PASSWORD = "new-password-456";
    private static final String PASSWORD_PATH = "/api/v1/user/password";
    private static final String AUTHENTICATION_VERSION_CLAIM = "auth_version";
    private static final int PROTECTED_SECURITY_LIMIT = 5;
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

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuthService authService;

    @MockitoBean
    private CvGenerationScheduler cvGenerationScheduler;

    @Test
    void successfulChange_returnsAuthResponseAndAdoptsAFreshSession() throws Exception {
        // given
        final IssuedSession registered = registerUser();
        final IssuedSession otherDevice = loginSession(registered.email(), PASSWORD);

        // when
        final MvcResult changeResult = changePassword(registered, PASSWORD, NEW_PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.userId").value(registered.userId().toString()))
                .andExpect(jsonPath("$.user.userPasswordChangedAt").isNotEmpty())
                .andExpect(cookie().exists("refresh_token"))
                .andReturn();
        final IssuedSession fresh = issuedSession(registered.email(), changeResult);

        // then
        assertThat(fresh.accessToken()).isNotEqualTo(registered.accessToken());
        assertThat(fresh.refreshCookie().getValue()).isNotEqualTo(registered.refreshCookie().getValue());
        assertThat(authenticationVersion(fresh.accessToken())).isEqualTo(1);

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(fresh.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userPasswordChangedAt").isNotEmpty());
        mockMvc.perform(get("/api/v1/user/sign-in-methods").header("Authorization", bearer(fresh.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.password.enabled").value(true))
                .andExpect(jsonPath("$.password.changedAt").isNotEmpty());

        login(registered.email(), NEW_PASSWORD)
                .andExpect(status().isOk());
        login(registered.email(), PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(registered.accessToken())))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(otherDevice.accessToken())))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(registered.refreshCookie()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(otherDevice.refreshCookie()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(fresh.refreshCookie()))
                .andExpect(status().isOk());
    }

    @Test
    void unchangedReplacement_isRejectedWithoutRevokingSessions() throws Exception {
        // given
        final IssuedSession session = registerUser();

        // when / then
        changePassword(session, PASSWORD, PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PASSWORD_UNCHANGED"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(session.refreshCookie()))
                .andExpect(status().isOk());
        login(session.email(), PASSWORD)
                .andExpect(status().isOk());
    }

    @Test
    void wrongCurrentPassword_isRejectedWithoutMutatingCredentials() throws Exception {
        // given
        final IssuedSession session = registerUser();

        // when / then
        changePassword(session, "wrong-password", NEW_PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk());
        login(session.email(), PASSWORD)
                .andExpect(status().isOk());
        login(session.email(), NEW_PASSWORD)
                .andExpect(status().isUnauthorized());
    }

    @Test
    void missingCurrentPassword_isRequiredWhenPasswordSignInExists() throws Exception {
        // given
        final IssuedSession session = registerUser();

        // when / then
        changePasswordBody(session, passwordBody(null, NEW_PASSWORD))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CURRENT_PASSWORD_REQUIRED"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk());
    }

    @Test
    void invalidNewPassword_doesNotRevokeExistingSessions() throws Exception {
        // given
        final IssuedSession session = registerUser();

        // when / then
        changePassword(session, PASSWORD, "short")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/auth/refresh").with(csrf()).cookie(session.refreshCookie()))
                .andExpect(status().isOk());
    }

    @Test
    void registrationAndPasswordChange_shareUtf8BytePasswordPolicy() throws Exception {
        // given
        final String unicodePassword = "пароль 12";
        final String seventyTwoBytePassword = "\u00E9".repeat(36);
        final String seventyThreeAsciiPassword = "a".repeat(73);
        final String seventyFourUtf8Password = "\u00E9".repeat(37);
        final IssuedSession session = registerUser();

        // when / then
        register(uniqueEmail("unicode"), unicodePassword)
                .andExpect(status().isCreated());
        register(uniqueEmail("seventy-two-bytes"), seventyTwoBytePassword)
                .andExpect(status().isCreated());
        register(uniqueEmail("too-long-ascii"), seventyThreeAsciiPassword)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        register(uniqueEmail("too-long-utf8"), seventyFourUtf8Password)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        changePassword(session, PASSWORD, unicodePassword)
                .andExpect(status().isOk());
        final IssuedSession afterUnicode = loginSession(session.email(), unicodePassword);

        changePassword(afterUnicode, unicodePassword, seventyTwoBytePassword)
                .andExpect(status().isOk());
        final IssuedSession afterSeventyTwoBytes = loginSession(session.email(), seventyTwoBytePassword);
        changePassword(afterSeventyTwoBytes, seventyTwoBytePassword, seventyThreeAsciiPassword)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        changePassword(afterSeventyTwoBytes, seventyTwoBytePassword, seventyFourUtf8Password)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void googleOnlyUser_cannotCreateAPasswordWithoutAGrant() throws Exception {
        // given
        final User user = userRepository.saveAndFlush(User.googleJustInTime(uniqueEmail("google-only")));
        final String accessToken = authService.issueSession(user).authResponse().accessToken();
        final IssuedSession session = new IssuedSession(user.getUserId(), user.getUserEmail(), accessToken, null);

        // when / then
        changePasswordBody(session, passwordBody(null, NEW_PASSWORD))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CREATION_GRANT_REQUIRED"));
    }

    @Test
    void sixthProtectedChangeAttemptForSameUserAndIp_isRateLimitedBeforeMutation() throws Exception {
        // given
        final IssuedSession session = registerUser();
        final String clientIp = uniqueIp();

        // when / then
        for (int attempt = 0; attempt < PROTECTED_SECURITY_LIMIT; attempt++) {
            changePassword(session, "wrong-password", NEW_PASSWORD, clientIp)
                    .andExpect(status().isUnauthorized());
        }

        changePassword(session, "wrong-password", NEW_PASSWORD, clientIp)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));

        login(session.email(), PASSWORD)
                .andExpect(status().isOk());
    }

    @Test
    void confirmationFieldIsNotPartOfTheApiContract() throws Exception {
        // given
        final IssuedSession session = registerUser();
        final ObjectNode body = objectMapper.createObjectNode();
        body.put("currentPassword", PASSWORD);
        body.put("newPassword", NEW_PASSWORD);
        body.put("confirmation", "mismatch-is-ignored");

        // when / then
        changePasswordBody(session, objectMapper.writeValueAsString(body))
                .andExpect(status().isOk());
    }

    private ResultActions changePassword(
            final IssuedSession session,
            final String currentPassword,
            final String newPassword) throws Exception {
        return changePassword(session, currentPassword, newPassword, null);
    }

    private ResultActions changePassword(
            final IssuedSession session,
            final String currentPassword,
            final String newPassword,
            final String clientIp) throws Exception {
        return changePasswordBody(session, passwordBody(currentPassword, newPassword), clientIp);
    }

    private ResultActions changePasswordBody(final IssuedSession session, final String body) throws Exception {
        return changePasswordBody(session, body, null);
    }

    private ResultActions changePasswordBody(
            final IssuedSession session,
            final String body,
            final String clientIp) throws Exception {
        final MockHttpServletRequestBuilder request = put(PASSWORD_PATH)
                .header("Authorization", bearer(session.accessToken()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
        if (clientIp != null) {
            request.with(remoteAddr(clientIp));
        }
        return mockMvc.perform(request);
    }

    private String passwordBody(final String currentPassword, final String newPassword) throws Exception {
        final ObjectNode body = objectMapper.createObjectNode();
        if (currentPassword != null) {
            body.put("currentPassword", currentPassword);
        }
        body.put("newPassword", newPassword);
        return objectMapper.writeValueAsString(body);
    }

    private IssuedSession registerUser() throws Exception {
        final String email = uniqueEmail("password-change");
        final MvcResult result = register(email, PASSWORD)
                .andExpect(status().isCreated())
                .andReturn();
        return issuedSession(email, result);
    }

    private ResultActions register(final String email, final String password) throws Exception {
        final ObjectNode body = objectMapper.createObjectNode();
        body.put("email", email);
        body.put("password", password);
        body.put("displayName", "Password User");
        return mockMvc.perform(post("/api/v1/auth/register")
                .with(remoteAddr(uniqueIp()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private IssuedSession loginSession(final String email, final String password) throws Exception {
        return issuedSession(email, login(email, password).andExpect(status().isOk()).andReturn());
    }

    private ResultActions login(final String email, final String password) throws Exception {
        final ObjectNode body = objectMapper.createObjectNode();
        body.put("email", email);
        body.put("password", password);
        return mockMvc.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private IssuedSession issuedSession(final String email, final MvcResult result) throws Exception {
        final String body = result.getResponse().getContentAsString();
        final UUID userId = UUID.fromString(JsonPath.read(body, "$.user.userId"));
        final String accessToken = JsonPath.read(body, "$.accessToken");
        final Cookie refreshCookie = result.getResponse().getCookie("refresh_token");
        assertThat(refreshCookie).isNotNull();
        return new IssuedSession(userId, email, accessToken, refreshCookie);
    }

    private static String bearer(final String accessToken) {
        return "Bearer " + accessToken;
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

    private static RequestPostProcessor remoteAddr(final String clientIp) {
        return request -> {
            request.setRemoteAddr(clientIp);
            return request;
        };
    }

    private static String uniqueEmail(final String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@example.com";
    }

    private static String uniqueIp() {
        return "2001:db8::" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private record IssuedSession(UUID userId, String email, String accessToken, Cookie refreshCookie) {
    }
}
