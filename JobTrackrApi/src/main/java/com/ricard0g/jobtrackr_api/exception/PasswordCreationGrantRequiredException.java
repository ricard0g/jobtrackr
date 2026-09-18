package com.ricard0g.jobtrackr_api.exception;

public class PasswordCreationGrantRequiredException extends RuntimeException {

    public PasswordCreationGrantRequiredException() {
        super("A Password Creation Grant is required to create password sign-in");
    }
}
