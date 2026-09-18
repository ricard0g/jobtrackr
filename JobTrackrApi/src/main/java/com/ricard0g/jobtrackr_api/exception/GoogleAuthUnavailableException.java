package com.ricard0g.jobtrackr_api.exception;

public class GoogleAuthUnavailableException extends RuntimeException {

    public GoogleAuthUnavailableException() {
        super("Google sign-in is currently unavailable");
    }
}
