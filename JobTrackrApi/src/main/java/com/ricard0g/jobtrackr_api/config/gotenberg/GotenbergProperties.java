package com.ricard0g.jobtrackr_api.config.gotenberg;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jobtrackr.gotenberg")
public record GotenbergProperties(String baseUrl, Duration requestTimeout, long maxResponseBytes) {

    private static final Duration DEFAULT_REQUEST_TIMEOUT = Duration.ofSeconds(35);
    private static final long DEFAULT_MAX_RESPONSE_BYTES = 15L * 1024 * 1024;

    public GotenbergProperties {
        if (requestTimeout == null) {
            requestTimeout = DEFAULT_REQUEST_TIMEOUT;
        }
        if (maxResponseBytes <= 0) {
            maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES;
        }
    }

    public void validate() {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalStateException("GOTENBERG_BASE_URL is required");
        }
        if (requestTimeout.isNegative() || requestTimeout.isZero()) {
            throw new IllegalStateException("GOTENBERG_REQUEST_TIMEOUT must be a positive duration");
        }
        if (maxResponseBytes <= 0) {
            throw new IllegalStateException("GOTENBERG_MAX_RESPONSE_BYTES must be a positive size");
        }
    }
}
