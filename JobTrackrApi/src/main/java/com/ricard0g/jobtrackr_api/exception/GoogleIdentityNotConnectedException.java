package com.ricard0g.jobtrackr_api.exception;

public class GoogleIdentityNotConnectedException extends RuntimeException {

    public GoogleIdentityNotConnectedException() {
        super("Google is not connected");
    }
}
