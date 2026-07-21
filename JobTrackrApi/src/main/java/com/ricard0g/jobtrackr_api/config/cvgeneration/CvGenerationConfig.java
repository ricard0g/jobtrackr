package com.ricard0g.jobtrackr_api.config.cvgeneration;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Arrays;
import java.util.Set;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@EnableConfigurationProperties(CvGenerationProperties.class)
public class CvGenerationConfig {

    private static final Set<String> PERMISSIVE_PROFILES = Set.of("local", "test");
    private static final String DEV_DEFAULT_TOKEN = "dev-service-token";

    public CvGenerationConfig(final CvGenerationProperties properties, final Environment environment) {
        final boolean permissive = Arrays.stream(environment.getActiveProfiles())
                .anyMatch(PERMISSIVE_PROFILES::contains);
        final String token = properties.serviceToken();
        if (!permissive
                && (token == null || token.isBlank() || DEV_DEFAULT_TOKEN.equals(token))) {
            throw new IllegalStateException(
                    "CV_GENERATION_SERVICE_TOKEN must be set to a non-default value outside local/test profiles");
        }
    }

    @Bean
    public HttpClient cvGenerationHttpClient(final CvGenerationProperties properties) {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }
}
