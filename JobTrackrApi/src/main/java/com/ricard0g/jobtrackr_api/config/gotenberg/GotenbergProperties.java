package com.ricard0g.jobtrackr_api.config.gotenberg;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jobtrackr.gotenberg")
public record GotenbergProperties(String baseUrl, Duration requestTimeout) {

    private static final Duration DEFAULT_REQUEST_TIMEOUT = Duration.ofSeconds(35);

    public GotenbergProperties {
        if (requestTimeout == null) {
            requestTimeout = DEFAULT_REQUEST_TIMEOUT;
        }
    }

    public void validate() {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalStateException("GOTENBERG_BASE_URL is required");
        }
        if (requestTimeout.isNegative() || requestTimeout.isZero()) {
            throw new IllegalStateException("GOTENBERG_REQUEST_TIMEOUT must be a positive duration");
        }
    }
}
