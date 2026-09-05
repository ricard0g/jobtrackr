package com.ricard0g.jobtrackr_api.security.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.ricard0g.jobtrackr_api.config.security.AuthenticationRateLimitProperties;
import com.ricard0g.jobtrackr_api.exception.RateLimitedException;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.TimeMeter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class Bucket4jAuthenticationRateLimiter implements AuthenticationRateLimiter {

    private static final String METRIC_NAME = "jobtrackr.auth.rate_limit";
    private static final String ACTION_TAG = "action";
    private static final String OUTCOME_TAG = "outcome";
    private static final String OUTCOME_ALLOWED = "allowed";
    private static final String OUTCOME_REJECTED = "rejected";

    private static final long TOKENS_PER_ATTEMPT = 1L;

    private static final long PASSWORD_LOGIN_EMAIL_IP_CAPACITY = 5L;
    private static final Duration PASSWORD_LOGIN_EMAIL_IP_PERIOD = Duration.ofMinutes(5);
    private static final long PASSWORD_LOGIN_IP_CAPACITY = 50L;
    private static final Duration PASSWORD_LOGIN_IP_PERIOD = Duration.ofMinutes(5);
    private static final long REGISTRATION_IP_CAPACITY = 10L;
    private static final Duration REGISTRATION_IP_PERIOD = Duration.ofHours(1);
    private static final long GOOGLE_START_IP_CAPACITY = 20L;
    private static final Duration GOOGLE_START_IP_PERIOD = Duration.ofMinutes(10);
    private static final long PROTECTED_SECURITY_CAPACITY = 5L;
    private static final Duration PROTECTED_SECURITY_PERIOD = Duration.ofMinutes(10);

    private final Cache<String, Bucket> buckets;
    private final TimeMeter timeMeter;
    private final MeterRegistry meterRegistry;

    public Bucket4jAuthenticationRateLimiter(
            final AuthenticationRateLimitProperties properties,
            final Clock clock,
            final MeterRegistry meterRegistry) {
        this.timeMeter = new ClockTimeMeter(clock);
        this.meterRegistry = meterRegistry;
        this.buckets = Caffeine.newBuilder()
                .maximumSize(properties.cacheMaximumSize())
                .expireAfterAccess(properties.cacheExpireAfter())
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    @Override
    public void consume(final AuthenticationAction action, final AuthenticationRateLimitKey key) {
        switch (action) {
            case PASSWORD_LOGIN -> consumePasswordLogin(requireEmailAndIp(key));
            case REGISTRATION -> consumeSingle(
                    action,
                    ipKey(action, requireClientIp(key).clientIp()),
                    bandwidth(REGISTRATION_IP_CAPACITY, REGISTRATION_IP_PERIOD));
            case GOOGLE_START -> consumeSingle(
                    action,
                    ipKey(action, requireClientIp(key).clientIp()),
                    bandwidth(GOOGLE_START_IP_CAPACITY, GOOGLE_START_IP_PERIOD));
            case PROTECTED_SECURITY -> consumeSingle(
                    action,
                    userIpKey(requireUserAndIp(key)),
                    bandwidth(PROTECTED_SECURITY_CAPACITY, PROTECTED_SECURITY_PERIOD));
        }
    }

    @Override
    public void reset(final AuthenticationAction action, final AuthenticationRateLimitKey key) {
        if (action != AuthenticationAction.PASSWORD_LOGIN) {
            return;
        }
        buckets.invalidate(emailIpKey(requireEmailAndIp(key)));
    }

    private void consumePasswordLogin(final AuthenticationRateLimitKey key) {
        final Bucket emailIpBucket = bucket(
                emailIpKey(key),
                bandwidth(PASSWORD_LOGIN_EMAIL_IP_CAPACITY, PASSWORD_LOGIN_EMAIL_IP_PERIOD));
        final Bucket ipBucket = bucket(
                ipKey(AuthenticationAction.PASSWORD_LOGIN, key.clientIp()),
                bandwidth(PASSWORD_LOGIN_IP_CAPACITY, PASSWORD_LOGIN_IP_PERIOD));

        final ConsumptionProbe emailIpProbe = emailIpBucket.tryConsumeAndReturnRemaining(TOKENS_PER_ATTEMPT);
        if (!emailIpProbe.isConsumed()) {
            reject(AuthenticationAction.PASSWORD_LOGIN, emailIpProbe.getNanosToWaitForRefill());
        }

        final ConsumptionProbe ipProbe = ipBucket.tryConsumeAndReturnRemaining(TOKENS_PER_ATTEMPT);
        if (!ipProbe.isConsumed()) {
            emailIpBucket.addTokens(TOKENS_PER_ATTEMPT);
            reject(AuthenticationAction.PASSWORD_LOGIN, ipProbe.getNanosToWaitForRefill());
        }

        recordOutcome(AuthenticationAction.PASSWORD_LOGIN, OUTCOME_ALLOWED);
    }

    private void consumeSingle(
            final AuthenticationAction action,
            final String cacheKey,
            final Bandwidth limit) {
        final ConsumptionProbe probe = bucket(cacheKey, limit).tryConsumeAndReturnRemaining(TOKENS_PER_ATTEMPT);
        if (!probe.isConsumed()) {
            reject(action, probe.getNanosToWaitForRefill());
        }
        recordOutcome(action, OUTCOME_ALLOWED);
    }

    private void reject(final AuthenticationAction action, final long nanosToWaitForRefill) {
        recordOutcome(action, OUTCOME_REJECTED);
        log.warn("[AuthRateLimit] - REJECTED: action: {}", action.metricLabel());
        throw new RateLimitedException(Duration.ofNanos(nanosToWaitForRefill));
    }

    private Bucket bucket(final String cacheKey, final Bandwidth limit) {
        return buckets.get(cacheKey, ignored -> Bucket.builder()
                .withCustomTimePrecision(timeMeter)
                .addLimit(limit)
                .build());
    }

    private static Bandwidth bandwidth(final long capacity, final Duration period) {
        return Bandwidth.builder()
                .capacity(capacity)
                .refillIntervally(capacity, period)
                .build();
    }

    private static AuthenticationRateLimitKey requireEmailAndIp(final AuthenticationRateLimitKey key) {
        requireClientIp(key);
        if (key.canonicalEmail() == null) {
            throw new IllegalArgumentException("Canonical email is required");
        }
        return key;
    }

    private static AuthenticationRateLimitKey requireUserAndIp(final AuthenticationRateLimitKey key) {
        requireClientIp(key);
        if (key.userId() == null) {
            throw new IllegalArgumentException("User ID is required");
        }
        return key;
    }

    private static AuthenticationRateLimitKey requireClientIp(final AuthenticationRateLimitKey key) {
        final boolean missingClientIp = key.clientIp() == null || key.clientIp().isBlank();
        if (missingClientIp) {
            throw new IllegalArgumentException("Client IP is required");
        }
        return key;
    }

    private static String emailIpKey(final AuthenticationRateLimitKey key) {
        return AuthenticationAction.PASSWORD_LOGIN.metricLabel()
                + ":email-ip:"
                + key.canonicalEmail()
                + "|"
                + key.clientIp();
    }

    private static String ipKey(final AuthenticationAction action, final String clientIp) {
        return action.metricLabel() + ":ip:" + clientIp;
    }

    private static String userIpKey(final AuthenticationRateLimitKey key) {
        return AuthenticationAction.PROTECTED_SECURITY.metricLabel()
                + ":user-ip:"
                + key.userId()
                + "|"
                + key.clientIp();
    }

    private void recordOutcome(final AuthenticationAction action, final String outcome) {
        meterRegistry.counter(METRIC_NAME, ACTION_TAG, action.metricLabel(), OUTCOME_TAG, outcome).increment();
    }

    private static final class ClockTimeMeter implements TimeMeter {

        private final Clock clock;

        private ClockTimeMeter(final Clock clock) {
            this.clock = clock;
        }

        @Override
        public long currentTimeNanos() {
            return TimeUnit.MILLISECONDS.toNanos(clock.millis());
        }

        @Override
        public boolean isWallClockBased() {
            return true;
        }
    }
}
