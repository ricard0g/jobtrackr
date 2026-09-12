package com.ricard0g.jobtrackr_api.exception;

public class EmailNotMutableException extends RuntimeException {

    public EmailNotMutableException() {
        super("Primary Email cannot be changed");
    }
}
