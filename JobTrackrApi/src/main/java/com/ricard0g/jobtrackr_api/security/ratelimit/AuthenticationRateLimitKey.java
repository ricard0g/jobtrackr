package com.ricard0g.jobtrackr_api.security.ratelimit;

import java.util.Locale;
import java.util.UUID;

public record AuthenticationRateLimitKey(String clientIp, String canonicalEmail, UUID userId) {

    public static AuthenticationRateLimitKey clientIp(final String clientIp) {
        return new AuthenticationRateLimitKey(requireClientIp(clientIp), null, null);
    }

    public static AuthenticationRateLimitKey emailAndClientIp(final String email, final String clientIp) {
        return new AuthenticationRateLimitKey(requireClientIp(clientIp), canonicalizeEmail(email), null);
    }

    public static AuthenticationRateLimitKey userAndClientIp(final UUID userId, final String clientIp) {
        if (userId == null) {
            throw new IllegalArgumentException("User ID is required");
        }
        return new AuthenticationRateLimitKey(requireClientIp(clientIp), null, userId);
    }

    public static String canonicalizeEmail(final String email) {
        if (email == null) {
            throw new IllegalArgumentException("Email is required");
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String requireClientIp(final String clientIp) {
        final boolean missingClientIp = clientIp == null || clientIp.isBlank();
        if (missingClientIp) {
            throw new IllegalArgumentException("Client IP is required");
        }
        return clientIp;
    }
}
