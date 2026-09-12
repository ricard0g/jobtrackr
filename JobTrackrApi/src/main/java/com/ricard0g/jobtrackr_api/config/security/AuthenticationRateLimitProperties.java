package com.ricard0g.jobtrackr_api.config.security;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jobtrackr.auth.rate-limit")
public record AuthenticationRateLimitProperties(Long cacheMaximumSize, Duration cacheExpireAfter) {

    private static final long DEFAULT_CACHE_MAXIMUM_SIZE = 100_000L;
    private static final Duration DEFAULT_CACHE_EXPIRE_AFTER = Duration.ofHours(2);

    public AuthenticationRateLimitProperties {
        final boolean missingCacheSize = cacheMaximumSize == null || cacheMaximumSize <= 0;
        if (missingCacheSize) {
            cacheMaximumSize = DEFAULT_CACHE_MAXIMUM_SIZE;
        }
        final boolean missingExpireAfter = cacheExpireAfter == null
                || cacheExpireAfter.isZero()
                || cacheExpireAfter.isNegative();
        if (missingExpireAfter) {
            cacheExpireAfter = DEFAULT_CACHE_EXPIRE_AFTER;
        }
    }
}
