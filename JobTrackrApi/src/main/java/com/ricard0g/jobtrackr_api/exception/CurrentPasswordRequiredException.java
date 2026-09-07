package com.ricard0g.jobtrackr_api.exception;

public class CurrentPasswordRequiredException extends RuntimeException {

    public CurrentPasswordRequiredException() {
        super("Current password is required");
    }
}
