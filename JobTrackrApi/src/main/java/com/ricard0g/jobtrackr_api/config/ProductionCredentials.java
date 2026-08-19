package com.ricard0g.jobtrackr_api.config;

import java.nio.charset.StandardCharsets;
import java.util.Set;

import com.ricard0g.jobtrackr_api.config.storage.R2Properties;

public final class ProductionCredentials {

    private static final String DEV_DEFAULT_CV_GENERATION_TOKEN = "dev-service-token";
    private static final int MIN_JWT_SIGNING_KEY_BYTES = 32;
    private static final Set<String> DISALLOWED_JWT_SIGNING_KEYS = Set.of(
            "change-me-to-a-long-random-local-secret-at-least-32-bytes");

    private ProductionCredentials() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }

    public static void validate(
            final String postgresPassword,
            final String jwtSigningKey,
            final String cvGenerationServiceToken,
            final R2Properties r2Properties) {
        if (isBlank(postgresPassword)) {
            throw new IllegalStateException("DB_PASSWORD is required");
        }
        if (isBlank(jwtSigningKey)) {
            throw new IllegalStateException("JWT_SIGNING_KEY is required");
        }
        if (jwtSigningKey.getBytes(StandardCharsets.UTF_8).length < MIN_JWT_SIGNING_KEY_BYTES) {
            throw new IllegalStateException("JWT_SIGNING_KEY must be at least 32 bytes");
        }
        final boolean documentedExampleJwtSigningKey = DISALLOWED_JWT_SIGNING_KEYS.contains(jwtSigningKey);
        if (documentedExampleJwtSigningKey) {
            throw new IllegalStateException(
                    "JWT_SIGNING_KEY must be set to a non-default value outside local/test profiles");
        }
        final boolean missingOrDefaultCvToken = isBlank(cvGenerationServiceToken)
                || DEV_DEFAULT_CV_GENERATION_TOKEN.equals(cvGenerationServiceToken);
        if (missingOrDefaultCvToken) {
            throw new IllegalStateException(
                    "CV_GENERATION_SERVICE_TOKEN must be set to a non-default value outside local/test profiles");
        }
        r2Properties.validate();
    }

    private static boolean isBlank(final String value) {
        return value == null || value.isBlank();
    }
}
