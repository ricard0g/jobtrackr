package com.ricard0g.jobtrackr_api.config.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.ricard0g.jobtrackr_api.security.ratelimit.MutableClock;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(AuthenticationRateLimitEvictionIntegrationTest.TestClockConfiguration.class)
@TestPropertySource(properties = {
        "jwt.signing-key=" + AuthenticationRateLimitEvictionIntegrationTest.SIGNING_KEY,
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket",
        "jobtrackr.auth.rate-limit.cache-expire-after=1m"
})
class AuthenticationRateLimitEvictionIntegrationTest {

    static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private static final String WRONG_PASSWORD = "wrong-password";
    private static final int PASSWORD_LOGIN_EMAIL_IP_LIMIT = 5;
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

    @MockitoBean
    private CvGenerationScheduler cvGenerationScheduler;

    @Test
    void passwordLogin_expiredLimiterState_allowsAttemptsBeforeTheWindowRefills() throws Exception {
        // given
        final String email = "evict-" + UUID.randomUUID() + "@example.com";
        final String clientIp = "2001:db8::" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);

        for (int attempt = 0; attempt < PASSWORD_LOGIN_EMAIL_IP_LIMIT; attempt++) {
            login(email, clientIp).andExpect(status().isUnauthorized());
        }
        login(email, clientIp).andExpect(status().isTooManyRequests());

        // when
        clock.advance(Duration.ofMinutes(1));

        // then
        login(email, clientIp)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    private org.springframework.test.web.servlet.ResultActions login(
            final String email,
            final String clientIp) throws Exception {
        return mockMvc.perform(post("/api/v1/auth/login")
                .with(remoteAddr(clientIp))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "email": "%s",
                          "password": "%s"
                        }
                        """.formatted(email, WRONG_PASSWORD)));
    }

    private static RequestPostProcessor remoteAddr(final String clientIp) {
        return request -> {
            request.setRemoteAddr(clientIp);
            return request;
        };
    }

    @TestConfiguration
    static class TestClockConfiguration {

        @Bean
        MutableClock clock() {
            return new MutableClock(Instant.parse("2026-09-05T12:00:00Z"));
        }
    }
}
