package com.ricard0g.jobtrackr_api.config.storage;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jobtrackr.r2")
public record R2Properties(
        String endpoint,
        String accessKeyId,
        String secretAccessKey,
        String bucket,
        long signedUrlSeconds) {

    private static final long DEFAULT_SIGNED_URL_SECONDS = 60;

    public Duration signedUrlDuration() {
        final long seconds = signedUrlSeconds > 0 ? signedUrlSeconds : DEFAULT_SIGNED_URL_SECONDS;
        return Duration.ofSeconds(seconds);
    }

    public void validate() {
        if (isBlank(endpoint) || isBlank(accessKeyId) || isBlank(secretAccessKey) || isBlank(bucket)) {
            throw new IllegalStateException(
                    "R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET are required");
        }
        if (!endpoint.startsWith("https://")) {
            throw new IllegalStateException("R2_ENDPOINT must be the Cloudflare R2 EU jurisdiction HTTPS endpoint");
        }
    }

    private boolean isBlank(final String value) {
        return value == null || value.isBlank();
    }
}
