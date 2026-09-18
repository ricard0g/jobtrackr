package com.ricard0g.jobtrackr_api.exception;

public class GooglePasswordReauthNotAllowedException extends RuntimeException {

    public GooglePasswordReauthNotAllowedException() {
        super("Google password reauthentication is not available");
    }
}
