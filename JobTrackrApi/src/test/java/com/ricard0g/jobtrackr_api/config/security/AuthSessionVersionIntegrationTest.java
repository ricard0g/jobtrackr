package com.ricard0g.jobtrackr_api.config.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

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
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.service.UserAuthVersionService;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.Cookie;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "jwt.signing-key=" + AuthSessionVersionIntegrationTest.SIGNING_KEY,
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket"
})
class AuthSessionVersionIntegrationTest {

    static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private static final String PASSWORD = "password123";
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
    private UserAuthVersionService userAuthVersionService;

    @MockitoBean
    private CvGenerationScheduler cvGenerationScheduler;

    @Test
    void register_shouldIssueAccessTokenWithAuthenticationVersionZero() throws Exception {
        // given / when
        final IssuedSession session = registerUser();

        // then
        assertThat(authenticationVersion(session.accessToken())).isZero();
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(session.userId().toString()));
    }

    @Test
    void loginAndRefresh_shouldIssueAccessTokensWithCurrentAuthenticationVersion() throws Exception {
        final IssuedSession registered = registerUser();

        final IssuedSession loggedIn = login(registered.email());
        assertThat(authenticationVersion(loggedIn.accessToken())).isZero();
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(loggedIn.accessToken())))
                .andExpect(status().isOk());

        final IssuedSession refreshed = refresh(loggedIn.refreshCookie());
        assertThat(authenticationVersion(refreshed.accessToken())).isZero();
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(refreshed.accessToken())))
                .andExpect(status().isOk());
    }

    @Test
    void logout_shouldRevokeRefreshTokenWithoutBlockingCurrentAccessToken() throws Exception {
        final IssuedSession session = registerUser();

        mockMvc.perform(post("/api/v1/auth/logout")
                        .with(csrf())
                        .cookie(session.refreshCookie()))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(session.refreshCookie()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("REFRESH_TOKEN_REUSE"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk());
    }

    @Test
    void legacyAccessTokenWithoutVersionClaim_shouldAuthenticateWhenPersistedVersionIsZero() throws Exception {
        final IssuedSession session = registerUser();
        final String legacyToken = accessToken(session.userId(), null);

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(legacyToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(session.userId().toString()));
    }

    @Test
    void advancingAuthenticationVersion_shouldRejectLegacyAndOlderVersionedAccessTokens() throws Exception {
        final IssuedSession session = registerUser();
        final String legacyToken = accessToken(session.userId(), null);
        final String versionedZeroToken = accessToken(session.userId(), JwtService.LEGACY_AUTHENTICATION_VERSION);

        userAuthVersionService.advance(session.userId());

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(legacyToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(versionedZeroToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void advancingAuthenticationVersion_shouldKeepRefreshRotationAndIssueTheNewVersion() throws Exception {
        final IssuedSession session = registerUser();

        userAuthVersionService.advance(session.userId());

        final IssuedSession refreshed = refresh(session.refreshCookie());
        assertThat(authenticationVersion(refreshed.accessToken())).isEqualTo(1);
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(refreshed.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(session.userId().toString()));

        userAuthVersionService.advance(session.userId());

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(refreshed.accessToken())))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        final IssuedSession secondRefresh = refresh(refreshed.refreshCookie());
        assertThat(authenticationVersion(secondRefresh.accessToken())).isEqualTo(2);
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(secondRefresh.accessToken())))
                .andExpect(status().isOk());
    }

    private IssuedSession registerUser() throws Exception {
        final String email = "session-version-" + UUID.randomUUID() + "@example.com";
        final MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "%s",
                                  "password": "%s",
                                  "displayName": "Session User"
                                }
                                """.formatted(email, PASSWORD)))
                .andExpect(status().isCreated())
                .andReturn();
        return issuedSession(email, result);
    }

    private IssuedSession login(final String email) throws Exception {
        final MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "%s",
                                  "password": "%s"
                                }
                                """.formatted(email, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();
        return issuedSession(email, result);
    }

    private IssuedSession refresh(final Cookie refreshCookie) throws Exception {
        final MvcResult result = mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(refreshCookie))
                .andExpect(status().isOk())
                .andReturn();
        return issuedSession(null, result);
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
        final Integer version = parseClaims(accessToken).get(JwtService.AUTHENTICATION_VERSION_CLAIM, Integer.class);
        assertThat(version).isNotNull();
        return version;
    }

    private static String accessToken(final UUID userId, final Integer authenticationVersion) {
        final SecretKey signingKey = Keys.hmacShaKeyFor(SIGNING_KEY.getBytes());
        final Date now = new Date();
        JwtBuilder builder = Jwts.builder()
                .subject(userId.toString())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + 900_000L))
                .signWith(signingKey);
        if (authenticationVersion != null) {
            builder = builder.claim(JwtService.AUTHENTICATION_VERSION_CLAIM, authenticationVersion);
        }
        return builder.compact();
    }

    private static Claims parseClaims(final String accessToken) {
        final SecretKey signingKey = Keys.hmacShaKeyFor(SIGNING_KEY.getBytes());
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(accessToken)
                .getPayload();
    }

    private record IssuedSession(UUID userId, String email, String accessToken, Cookie refreshCookie) {
    }
}
