package com.ricard0g.jobtrackr_api.exception;

import java.time.OffsetDateTime;

public record ApiErrorResponse(
        OffsetDateTime timestamp, int status, String error, String message, String path) {}
