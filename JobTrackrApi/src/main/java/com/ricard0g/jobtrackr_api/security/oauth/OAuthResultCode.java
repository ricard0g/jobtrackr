package com.ricard0g.jobtrackr_api.security.oauth;

public enum OAuthResultCode {
    CANCELLED("cancelled"),
    EXPIRED("expired"),
    UNAVAILABLE("unavailable"),
    FAILED("failed"),
    CONFLICT("conflict"),
    MISMATCH("mismatch");

    private final String queryValue;

    OAuthResultCode(final String queryValue) {
        this.queryValue = queryValue;
    }

    public String queryValue() {
        return queryValue;
    }
}
