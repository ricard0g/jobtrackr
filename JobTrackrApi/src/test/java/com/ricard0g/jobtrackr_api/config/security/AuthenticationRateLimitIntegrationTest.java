package com.ricard0g.jobtrackr_api.config.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
import org.testcontainers.utility.DockerImageName;

import com.ricard0g.jobtrackr_api.exception.RateLimitedException;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationAction;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimitKey;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;
import com.ricard0g.jobtrackr_api.security.ratelimit.MutableClock;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(AuthenticationRateLimitIntegrationTest.TestClockConfiguration.class)
@TestPropertySource(properties = {
        "jwt.signing-key=" + AuthenticationRateLimitIntegrationTest.SIGNING_KEY,
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket"
})
class AuthenticationRateLimitIntegrationTest {

    static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private static final String PASSWORD = "password123";
    private static final String WRONG_PASSWORD = "wrong-password";
    private static final int PASSWORD_LOGIN_EMAIL_IP_LIMIT = 5;
    private static final int PASSWORD_LOGIN_IP_LIMIT = 50;
    private static final int REGISTRATION_IP_LIMIT = 10;
    private static final int GOOGLE_START_IP_LIMIT = 20;
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

    @Autowired
    private MutableClock clock;

    @Autowired
    private AuthenticationRateLimiter authenticationRateLimiter;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MeterRegistry meterRegistry;

    @MockitoBean
    private CvGenerationScheduler cvGenerationScheduler;

    @Test
    void passwordLogin_sixthAttemptForSameEmailAndIp_returnsRateLimited() throws Exception {
        // given
        final String email = uniqueEmail("login");
        final String clientIp = uniqueIp();

        // when / then
        for (int attempt = 0; attempt < PASSWORD_LOGIN_EMAIL_IP_LIMIT; attempt++) {
            login(email, WRONG_PASSWORD, clientIp)
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        }

        login(email, WRONG_PASSWORD, clientIp)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void passwordLogin_canonicalEmailSharesTheFailureBucket() throws Exception {
        // given
        final String clientIp = uniqueIp();

        // when / then
        for (int attempt = 0; attempt < PASSWORD_LOGIN_EMAIL_IP_LIMIT; attempt++) {
            login("User@Example.com", WRONG_PASSWORD, clientIp)
                    .andExpect(status().isUnauthorized());
        }

        login("user@example.com", WRONG_PASSWORD, clientIp)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }

    @Test
    void passwordLogin_doesNotThrottleADifferentEmailOnTheSameIp() throws Exception {
        // given
        final String clientIp = uniqueIp();
        exhaustEmailIpBucket(uniqueEmail("first"), clientIp);

        // when / then
        login(uniqueEmail("second"), WRONG_PASSWORD, clientIp)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void passwordLogin_doesNotThrottleTheSameEmailOnADifferentIp() throws Exception {
        // given
        final String email = uniqueEmail("shared");
        exhaustEmailIpBucket(email, uniqueIp());

        // when / then
        login(email, WRONG_PASSWORD, uniqueIp())
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void passwordLogin_successfulLoginClearsEmailIpFailureBucket() throws Exception {
        // given
        final String email = uniqueEmail("reset");
        final String clientIp = uniqueIp();
        register(email, clientIp).andExpect(status().isCreated());

        // when
        for (int attempt = 0; attempt < PASSWORD_LOGIN_EMAIL_IP_LIMIT - 1; attempt++) {
            login(email, WRONG_PASSWORD, clientIp).andExpect(status().isUnauthorized());
        }
        login(email, PASSWORD, clientIp).andExpect(status().isOk());

        // then
        login(email, WRONG_PASSWORD, clientIp)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void passwordLogin_fiftyFirstAttemptFromSameIp_returnsRateLimited() throws Exception {
        // given
        final String clientIp = uniqueIp();

        // when / then
        for (int attempt = 0; attempt < PASSWORD_LOGIN_IP_LIMIT; attempt++) {
            login(uniqueEmail("ip-" + attempt), WRONG_PASSWORD, clientIp)
                    .andExpect(status().isUnauthorized());
        }

        login(uniqueEmail("ip-overflow"), WRONG_PASSWORD, clientIp)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void passwordLogin_retryAfterElapses_allowsAnotherAttempt() throws Exception {
        // given
        final String email = uniqueEmail("retry");
        final String clientIp = uniqueIp();
        exhaustEmailIpBucket(email, clientIp);

        // when
        final String retryAfter = login(email, WRONG_PASSWORD, clientIp)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andReturn()
                .getResponse()
                .getHeader(HttpHeaders.RETRY_AFTER);

        assertThat(retryAfter).isNotBlank();
        final long retryAfterSeconds = Long.parseLong(retryAfter);
        assertThat(retryAfterSeconds).isBetween(1L, 300L);
        clock.advance(Duration.ofSeconds(retryAfterSeconds));

        // then
        login(email, WRONG_PASSWORD, clientIp)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void registration_eleventhAttemptFromSameIp_returnsRateLimited() throws Exception {
        // given
        final String email = uniqueEmail("register");
        final String clientIp = uniqueIp();

        // when / then
        register(email, clientIp).andExpect(status().isCreated());
        for (int attempt = 1; attempt < REGISTRATION_IP_LIMIT; attempt++) {
            register(email, clientIp).andExpect(status().isConflict());
        }

        register(email, clientIp)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void registration_retryAfterElapses_allowsAnotherAttempt() throws Exception {
        // given
        final String email = uniqueEmail("register-retry");
        final String clientIp = uniqueIp();
        register(email, clientIp).andExpect(status().isCreated());
        for (int attempt = 1; attempt < REGISTRATION_IP_LIMIT; attempt++) {
            register(email, clientIp).andExpect(status().isConflict());
        }

        // when
        final String retryAfter = register(email, clientIp)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andReturn()
                .getResponse()
                .getHeader(HttpHeaders.RETRY_AFTER);
        clock.advance(Duration.ofSeconds(Long.parseLong(retryAfter)));

        // then
        register(uniqueEmail("register-retry-after"), clientIp)
                .andExpect(status().isCreated());
    }

    @Test
    void registration_doesNotThrottleADifferentIp() throws Exception {
        // given
        final String email = uniqueEmail("register-ip");
        final String throttledIp = uniqueIp();

        register(email, throttledIp).andExpect(status().isCreated());
        for (int attempt = 1; attempt < REGISTRATION_IP_LIMIT; attempt++) {
            register(email, throttledIp).andExpect(status().isConflict());
        }
        register(email, throttledIp).andExpect(status().isTooManyRequests());

        // when / then
        register(uniqueEmail("other-ip"), uniqueIp())
                .andExpect(status().isCreated());
    }

    @Test
    void passwordLogin_rateLimitDoesNotLockTheUser() throws Exception {
        // given
        final String email = uniqueEmail("nolock");
        final String clientIp = uniqueIp();
        register(email, clientIp).andExpect(status().isCreated());

        // when
        exhaustEmailIpBucket(email, clientIp);
        login(email, WRONG_PASSWORD, clientIp).andExpect(status().isTooManyRequests());

        // then
        assertThat(userRepository.findByUserEmail(email))
                .isPresent()
                .get()
                .extracting(user -> user.isUserLocked())
                .isEqualTo(false);
    }

    @Test
    void rateLimitMetrics_useOnlyActionAndOutcomeTags() throws Exception {
        // given
        final String email = uniqueEmail("metrics");
        final String clientIp = uniqueIp();

        // when
        exhaustEmailIpBucket(email, clientIp);
        login(email, WRONG_PASSWORD, clientIp).andExpect(status().isTooManyRequests());

        // then
        assertThat(meterRegistry.find("jobtrackr.auth.rate_limit").counters()).isNotEmpty();
        for (final Meter meter : meterRegistry.find("jobtrackr.auth.rate_limit").meters()) {
            assertThat(meter.getId().getTags()).allSatisfy(tag -> {
                assertThat(tag.getKey()).isIn("action", "outcome");
                assertThat(tag.getValue()).doesNotContain("@");
                assertThat(tag.getValue()).doesNotContain(":");
            });
        }
    }

    @Test
    void googleStart_twentyFirstAttemptFromSameIp_isRateLimited() {
        // given
        final AuthenticationRateLimitKey key = AuthenticationRateLimitKey.clientIp(uniqueIp());
        for (int attempt = 0; attempt < GOOGLE_START_IP_LIMIT; attempt++) {
            authenticationRateLimiter.consume(AuthenticationAction.GOOGLE_START, key);
        }

        // when / then
        assertThatThrownBy(() -> authenticationRateLimiter.consume(AuthenticationAction.GOOGLE_START, key))
                .isInstanceOf(RateLimitedException.class)
                .extracting(exception -> ((RateLimitedException) exception).retryAfterSeconds())
                .isEqualTo(600L);
    }

    @Test
    void protectedSecurity_sixthAttemptForSameUserAndIp_isRateLimited() {
        // given
        final AuthenticationRateLimitKey key = AuthenticationRateLimitKey.userAndClientIp(
                UUID.randomUUID(), uniqueIp());
        for (int attempt = 0; attempt < PROTECTED_SECURITY_LIMIT; attempt++) {
            authenticationRateLimiter.consume(AuthenticationAction.PROTECTED_SECURITY, key);
        }

        // when / then
        assertThatThrownBy(() -> authenticationRateLimiter.consume(AuthenticationAction.PROTECTED_SECURITY, key))
                .isInstanceOf(RateLimitedException.class);
    }

    @Test
    void protectedSecurity_doesNotThrottleADifferentUserOnTheSameIp() {
        // given
        final String clientIp = uniqueIp();
        final AuthenticationRateLimitKey firstUser = AuthenticationRateLimitKey.userAndClientIp(
                UUID.randomUUID(), clientIp);
        for (int attempt = 0; attempt < PROTECTED_SECURITY_LIMIT; attempt++) {
            authenticationRateLimiter.consume(AuthenticationAction.PROTECTED_SECURITY, firstUser);
        }

        // when / then
        authenticationRateLimiter.consume(
                AuthenticationAction.PROTECTED_SECURITY,
                AuthenticationRateLimitKey.userAndClientIp(UUID.randomUUID(), clientIp));
    }

    private void exhaustEmailIpBucket(final String email, final String clientIp) throws Exception {
        for (int attempt = 0; attempt < PASSWORD_LOGIN_EMAIL_IP_LIMIT; attempt++) {
            login(email, WRONG_PASSWORD, clientIp).andExpect(status().isUnauthorized());
        }
    }

    private ResultActions login(final String email, final String password, final String clientIp) throws Exception {
        return mockMvc.perform(post("/api/v1/auth/login")
                .with(remoteAddr(clientIp))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "email": "%s",
                          "password": "%s"
                        }
                        """.formatted(email, password)));
    }

    private ResultActions register(final String email, final String clientIp) throws Exception {
        return mockMvc.perform(post("/api/v1/auth/register")
                .with(remoteAddr(clientIp))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "email": "%s",
                          "password": "%s",
                          "displayName": "Rate Limit User"
                        }
                        """.formatted(email, PASSWORD)));
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

    @TestConfiguration
    static class TestClockConfiguration {

        @Bean
        MutableClock clock() {
            return new MutableClock(Instant.parse("2026-09-05T12:00:00Z"));
        }
    }
}
