package com.ricard0g.jobtrackr_api.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;

import org.junit.jupiter.api.Test;

import com.ricard0g.jobtrackr_api.exception.CvGenerationException;

class GeneratedCvCursorTest {

    @Test
    void encode_and_decode_roundTripsCreatedAtAndId() {
        // given
        final OffsetDateTime createdAt = OffsetDateTime.parse("2026-07-18T10:00:00Z");
        final Long generatedCvId = 42L;

        // when
        final String opaque = GeneratedCvCursor.encode(createdAt, generatedCvId);
        final GeneratedCvCursor decoded = GeneratedCvCursor.decode(opaque);

        // then
        assertThat(opaque).isNotBlank().doesNotContain(":");
        assertThat(decoded.createdAt()).isEqualTo(createdAt);
        assertThat(decoded.generatedCvId()).isEqualTo(generatedCvId);
    }

    @Test
    void decode_rejectsBlankCursor() {
        // when / then
        assertThatThrownBy(() -> GeneratedCvCursor.decode(" "))
                .isInstanceOf(CvGenerationException.class)
                .extracting(exception -> ((CvGenerationException) exception).getCode())
                .isEqualTo("INVALID_CURSOR");
    }

    @Test
    void decode_rejectsMalformedCursor() {
        // when / then
        assertThatThrownBy(() -> GeneratedCvCursor.decode("not-a-cursor"))
                .isInstanceOf(CvGenerationException.class)
                .extracting(exception -> ((CvGenerationException) exception).getCode())
                .isEqualTo("INVALID_CURSOR");
    }
}
