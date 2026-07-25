package com.ricard0g.jobtrackr_api.config.gotenberg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.junit.jupiter.api.Test;

class GotenbergPropertiesTest {

    @Test
    void validate_acceptsConfiguredBaseUrlAndTimeout() {
        // given
        final GotenbergProperties properties =
                new GotenbergProperties("http://localhost:3000", Duration.ofSeconds(35));

        // when / then
        assertThatCode(properties::validate).doesNotThrowAnyException();
    }

    @Test
    void validate_whenBaseUrlMissing_failsFast() {
        // given
        final GotenbergProperties properties = new GotenbergProperties(" ", Duration.ofSeconds(35));

        // when / then
        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GOTENBERG_BASE_URL");
    }

    @Test
    void defaultsRequestTimeoutToThirtyFiveSeconds() {
        // given / when
        final GotenbergProperties properties = new GotenbergProperties("http://localhost:3000", null);

        // then
        assertThat(properties.requestTimeout()).isEqualTo(Duration.ofSeconds(35));
    }
}
