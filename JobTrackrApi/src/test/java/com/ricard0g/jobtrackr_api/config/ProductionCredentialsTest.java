package com.ricard0g.jobtrackr_api.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.ricard0g.jobtrackr_api.config.storage.R2Properties;

class ProductionCredentialsTest {

    private static final String POSTGRES_PASSWORD = "production-postgres-password";
    private static final String JWT_SIGNING_KEY = "production-signing-key-at-least-32-bytes";
    private static final String CV_GENERATION_SERVICE_TOKEN = "production-service-token";

    @Test
    void acceptsCompleteProductionCredentials() {
        // given / when / then
        assertThatCode(() -> ProductionCredentials.validate(
                POSTGRES_PASSWORD,
                JWT_SIGNING_KEY,
                CV_GENERATION_SERVICE_TOKEN,
                validR2Properties()))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsMissingPostgresPassword() {
        // given / when / then
        assertThatThrownBy(() -> ProductionCredentials.validate(
                " ",
                JWT_SIGNING_KEY,
                CV_GENERATION_SERVICE_TOKEN,
                validR2Properties()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DB_PASSWORD");
    }

    @Test
    void rejectsMissingJwtSigningKey() {
        // given / when / then
        assertThatThrownBy(() -> ProductionCredentials.validate(
                POSTGRES_PASSWORD,
                "",
                CV_GENERATION_SERVICE_TOKEN,
                validR2Properties()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SIGNING_KEY");
    }

    @Test
    void rejectsDocumentedExampleJwtSigningKey() {
        // given / when / then
        assertThatThrownBy(() -> ProductionCredentials.validate(
                POSTGRES_PASSWORD,
                "change-me-to-a-long-random-local-secret-at-least-32-bytes",
                CV_GENERATION_SERVICE_TOKEN,
                validR2Properties()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SIGNING_KEY");
    }

    @Test
    void rejectsDefaultCvGenerationServiceToken() {
        // given / when / then
        assertThatThrownBy(() -> ProductionCredentials.validate(
                POSTGRES_PASSWORD,
                JWT_SIGNING_KEY,
                "dev-service-token",
                validR2Properties()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CV_GENERATION_SERVICE_TOKEN");
    }

    @Test
    void rejectsMissingR2Configuration() {
        // given
        final R2Properties missingR2 = new R2Properties("", "", "", "", 60);

        // when / then
        assertThatThrownBy(() -> ProductionCredentials.validate(
                POSTGRES_PASSWORD,
                JWT_SIGNING_KEY,
                CV_GENERATION_SERVICE_TOKEN,
                missingR2))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("R2_");
    }

    private static R2Properties validR2Properties() {
        return new R2Properties(
                "https://example.eu.r2.cloudflarestorage.com",
                "access-key",
                "secret-key",
                "jobtrackr-production",
                60);
    }
}
