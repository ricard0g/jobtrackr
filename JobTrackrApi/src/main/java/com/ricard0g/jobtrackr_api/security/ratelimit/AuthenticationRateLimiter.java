package com.ricard0g.jobtrackr_api.security.ratelimit;

public interface AuthenticationRateLimiter {

    void consume(AuthenticationAction action, AuthenticationRateLimitKey key);

    void reset(AuthenticationAction action, AuthenticationRateLimitKey key);
}
