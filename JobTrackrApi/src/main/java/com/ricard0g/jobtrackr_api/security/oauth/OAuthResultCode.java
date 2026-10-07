package com.ricard0g.jobtrackr_api.security.oauth;

public enum OAuthResultCode {
    CANCELLED("cancelled"),
    EXPIRED("expired"),
    UNAVAILABLE("unavailable"),
    FAILED("failed"),
    CONFLICT("conflict"),
    MISMATCH("mismatch"),
    NOT_REGISTERED("not_registered"),
    REGISTRATION_USED("registration_used"),
    REGISTRATION_EXPIRED("registration_expired");

    private final String queryValue;

    OAuthResultCode(final String queryValue) {
        this.queryValue = queryValue;
    }

    public String queryValue() {
        return queryValue;
    }
}
