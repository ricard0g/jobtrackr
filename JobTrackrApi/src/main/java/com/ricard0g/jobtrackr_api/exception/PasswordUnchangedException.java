package com.ricard0g.jobtrackr_api.exception;

public class PasswordUnchangedException extends RuntimeException {

    public PasswordUnchangedException() {
        super("New password must be different from the current password");
    }
}
