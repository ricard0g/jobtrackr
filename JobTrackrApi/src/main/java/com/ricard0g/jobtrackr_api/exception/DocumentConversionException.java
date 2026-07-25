package com.ricard0g.jobtrackr_api.exception;

import lombok.Getter;

@Getter
public class DocumentConversionException extends RuntimeException {

    public enum Kind {
        TIMEOUT,
        SERVICE_UNAVAILABLE,
        MALFORMED_RESPONSE
    }

    private final Kind kind;

    public DocumentConversionException(final Kind kind, final String message) {
        super(message);
        this.kind = kind;
    }

    public DocumentConversionException(final Kind kind, final String message, final Throwable cause) {
        super(message, cause);
        this.kind = kind;
    }

    public static DocumentConversionException timeout() {
        return new DocumentConversionException(Kind.TIMEOUT, "Document conversion timed out");
    }

    public static DocumentConversionException timeout(final Throwable cause) {
        return new DocumentConversionException(Kind.TIMEOUT, "Document conversion timed out", cause);
    }

    public static DocumentConversionException serviceUnavailable() {
        return new DocumentConversionException(
                Kind.SERVICE_UNAVAILABLE, "Document conversion service is temporarily unavailable");
    }

    public static DocumentConversionException serviceUnavailable(final Throwable cause) {
        return new DocumentConversionException(
                Kind.SERVICE_UNAVAILABLE, "Document conversion service is temporarily unavailable", cause);
    }

    public static DocumentConversionException malformedResponse() {
        return new DocumentConversionException(
                Kind.MALFORMED_RESPONSE, "Document conversion returned an invalid PDF response");
    }
}
