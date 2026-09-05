package com.ricard0g.jobtrackr_api.security.ratelimit;

public enum AuthenticationAction {
    PASSWORD_LOGIN("password_login"),
    REGISTRATION("registration"),
    GOOGLE_START("google_start"),
    PROTECTED_SECURITY("protected_security");

    private final String metricLabel;

    AuthenticationAction(final String metricLabel) {
        this.metricLabel = metricLabel;
    }

    public String metricLabel() {
        return metricLabel;
    }
}
