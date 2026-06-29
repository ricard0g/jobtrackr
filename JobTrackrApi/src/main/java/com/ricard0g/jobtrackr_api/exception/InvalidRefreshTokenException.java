package com.ricard0g.jobtrackr_api.exception;

public class InvalidRefreshTokenException extends RuntimeException {

    public InvalidRefreshTokenException(final String message) {
        super(message);
    }
}
