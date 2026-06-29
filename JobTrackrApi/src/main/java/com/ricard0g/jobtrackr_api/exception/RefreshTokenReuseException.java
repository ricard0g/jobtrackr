package com.ricard0g.jobtrackr_api.exception;

public class RefreshTokenReuseException extends RuntimeException {

    public RefreshTokenReuseException(final String message) {
        super(message);
    }
}
