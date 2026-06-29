package com.ricard0g.jobtrackr_api.exception;

public class DuplicateEmailException extends RuntimeException {

    public DuplicateEmailException(final String message) {
        super(message);
    }
}
