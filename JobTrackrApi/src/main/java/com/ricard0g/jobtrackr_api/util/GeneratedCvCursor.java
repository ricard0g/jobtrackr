package com.ricard0g.jobtrackr_api.util;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;

import com.ricard0g.jobtrackr_api.exception.CvGenerationException;

public record GeneratedCvCursor(OffsetDateTime createdAt, Long generatedCvId) {

    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();
    private static final String SEPARATOR = "|";

    public static String encode(final OffsetDateTime createdAt, final Long generatedCvId) {
        final String payload = createdAt.toString() + SEPARATOR + generatedCvId;
        return ENCODER.encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    public static GeneratedCvCursor decode(final String opaque) {
        if (opaque == null || opaque.isBlank()) {
            throw CvGenerationException.invalidCursor();
        }
        try {
            final String payload = new String(DECODER.decode(opaque), StandardCharsets.UTF_8);
            final int separatorIndex = payload.lastIndexOf(SEPARATOR);
            if (separatorIndex <= 0 || separatorIndex == payload.length() - 1) {
                throw CvGenerationException.invalidCursor();
            }
            final OffsetDateTime createdAt = OffsetDateTime.parse(payload.substring(0, separatorIndex));
            final Long generatedCvId = Long.valueOf(payload.substring(separatorIndex + 1));
            if (generatedCvId <= 0) {
                throw CvGenerationException.invalidCursor();
            }
            return new GeneratedCvCursor(createdAt, generatedCvId);
        } catch (final IllegalArgumentException | DateTimeParseException exception) {
            throw CvGenerationException.invalidCursor();
        }
    }
}
