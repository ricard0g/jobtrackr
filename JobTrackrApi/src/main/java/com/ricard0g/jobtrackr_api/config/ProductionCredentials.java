package com.ricard0g.jobtrackr_api.config;

import java.nio.charset.StandardCharsets;
import java.util.Set;

import com.ricard0g.jobtrackr_api.config.storage.R2Properties;

public final class ProductionCredentials {

    private static final String DEV_DEFAULT_CV_GENERATION_TOKEN = "dev-service-token";
    private static final String DOCUMENTED_PLACEHOLDER_PREFIX = "replace-with-";
    private static final int MIN_JWT_SIGNING_KEY_BYTES = 32;
    private static final Set<String> DISALLOWED_POSTGRES_PASSWORDS = Set.of(
            "jobtrackr_app",
            "replace-with-local-compose-db-password");
    private static final Set<String> DISALLOWED_JWT_SIGNING_KEYS = Set.of(
            "change-me-to-a-long-random-local-secret-at-least-32-bytes",
            "replace-with-a-long-random-local-secret-at-least-32-bytes");
    private static final Set<String> DISALLOWED_CV_GENERATION_TOKENS = Set.of(
            DEV_DEFAULT_CV_GENERATION_TOKEN,
            "replace-with-local-compose-service-token");

    private ProductionCredentials() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }

    public static void validate(
            final String postgresPassword,
            final String jwtSigningKey,
            final String cvGenerationServiceToken,
            final R2Properties r2Properties) {
        validate(
                postgresPassword,
                jwtSigningKey,
                cvGenerationServiceToken,
                r2Properties,
                true,
                false);
    }

    public static void validate(
            final String postgresPassword,
            final String jwtSigningKey,
            final String cvGenerationServiceToken,
            final R2Properties r2Properties,
            final boolean refreshCookieSecure,
            final boolean allowInsecureRefreshCookie) {
        if (isBlank(postgresPassword) || isDocumentedPlaceholder(postgresPassword)
                || DISALLOWED_POSTGRES_PASSWORDS.contains(postgresPassword)) {
            throw new IllegalStateException(
                    "DB_PASSWORD must be set to a non-default value outside local/test profiles");
        }
        if (isBlank(jwtSigningKey)) {
            throw new IllegalStateException("JWT_SIGNING_KEY is required");
        }
        if (jwtSigningKey.getBytes(StandardCharsets.UTF_8).length < MIN_JWT_SIGNING_KEY_BYTES) {
            throw new IllegalStateException("JWT_SIGNING_KEY must be at least 32 bytes");
        }
        if (isDocumentedPlaceholder(jwtSigningKey) || DISALLOWED_JWT_SIGNING_KEYS.contains(jwtSigningKey)) {
            throw new IllegalStateException(
                    "JWT_SIGNING_KEY must be set to a non-default value outside local/test profiles");
        }
        if (isBlank(cvGenerationServiceToken)
                || isDocumentedPlaceholder(cvGenerationServiceToken)
                || DISALLOWED_CV_GENERATION_TOKENS.contains(cvGenerationServiceToken)) {
            throw new IllegalStateException(
                    "CV_GENERATION_SERVICE_TOKEN must be set to a non-default value outside local/test profiles");
        }
        if (!refreshCookieSecure && !allowInsecureRefreshCookie) {
            throw new IllegalStateException(
                    "JWT_REFRESH_COOKIE_SECURE must be true outside local/test profiles unless "
                            + "JWT_REFRESH_COOKIE_ALLOW_INSECURE is set");
        }
        r2Properties.validate();
    }

    private static boolean isDocumentedPlaceholder(final String value) {
        return value != null && value.startsWith(DOCUMENTED_PLACEHOLDER_PREFIX);
    }

    private static boolean isBlank(final String value) {
        return value == null || value.isBlank();
    }
}
