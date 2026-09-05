package com.ricard0g.jobtrackr_api.exception;

import java.time.Duration;

public class RateLimitedException extends RuntimeException {

    private static final long MINIMUM_RETRY_AFTER_SECONDS = 1L;

    private final Duration retryAfter;

    public RateLimitedException(final Duration retryAfter) {
        super("Too many authentication attempts");
        this.retryAfter = retryAfter;
    }

    public long retryAfterSeconds() {
        final long seconds = retryAfter.getSeconds();
        final boolean hasPartialSecond = retryAfter.getNano() > 0;
        if (hasPartialSecond) {
            return Math.max(seconds + 1L, MINIMUM_RETRY_AFTER_SECONDS);
        }
        return Math.max(seconds, MINIMUM_RETRY_AFTER_SECONDS);
    }
}
