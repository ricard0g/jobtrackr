package com.ricard0g.jobtrackr_api.config.gotenberg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.junit.jupiter.api.Test;

class GotenbergPropertiesTest {

    private static final long FIFTEEN_MB = 15L * 1024 * 1024;

    @Test
    void validate_acceptsConfiguredBaseUrlTimeoutAndMaxResponseBytes() {
        // given
        final GotenbergProperties properties =
                new GotenbergProperties("http://localhost:3000", Duration.ofSeconds(35), FIFTEEN_MB);

        // when / then
        assertThatCode(properties::validate).doesNotThrowAnyException();
    }

    @Test
    void validate_whenBaseUrlMissing_failsFast() {
        // given
        final GotenbergProperties properties =
                new GotenbergProperties(" ", Duration.ofSeconds(35), FIFTEEN_MB);

        // when / then
        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GOTENBERG_BASE_URL");
    }

    @Test
    void defaultsRequestTimeoutAndMaxResponseBytes() {
        // given / when
        final GotenbergProperties properties = new GotenbergProperties("http://localhost:3000", null, 0);

        // then
        assertThat(properties.requestTimeout()).isEqualTo(Duration.ofSeconds(35));
        assertThat(properties.maxResponseBytes()).isEqualTo(FIFTEEN_MB);
    }
}
