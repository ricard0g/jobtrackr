package com.ricard0g.jobtrackr_api.dto;

import java.util.List;

public record ErrorResponse(String code, String message, List<FieldError> fieldErrors) {

    public record FieldError(String field, String message) {}

    public static ErrorResponse of(final String code, final String message) {
        return new ErrorResponse(code, message, null);
    }

    public static ErrorResponse of(
            final String code, final String message, final List<FieldError> fieldErrors) {
        return new ErrorResponse(code, message, fieldErrors);
    }
}
