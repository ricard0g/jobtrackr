package com.ricard0g.jobtrackr_api.exception;

public class GoogleDisconnectNotAllowedException extends RuntimeException {

    public GoogleDisconnectNotAllowedException() {
        super("Create a password before disconnecting Google");
    }
}
