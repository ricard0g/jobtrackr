package com.ricard0g.jobtrackr_api.config.security;

import java.time.Clock;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;
import com.ricard0g.jobtrackr_api.security.ratelimit.Bucket4jAuthenticationRateLimiter;

import io.micrometer.core.instrument.MeterRegistry;

@Configuration
@EnableConfigurationProperties(AuthenticationRateLimitProperties.class)
public class AuthenticationRateLimitConfig {

    @Bean
    AuthenticationRateLimiter authenticationRateLimiter(
            final AuthenticationRateLimitProperties properties,
            final ObjectProvider<Clock> clocks,
            final MeterRegistry meterRegistry) {
        return new Bucket4jAuthenticationRateLimiter(
                properties,
                clocks.getIfAvailable(Clock::systemUTC),
                meterRegistry);
    }
}
