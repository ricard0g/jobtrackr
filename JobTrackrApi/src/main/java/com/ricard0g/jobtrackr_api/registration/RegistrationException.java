package com.ricard0g.jobtrackr_api.registration;

import org.springframework.http.HttpStatus;
import lombok.Getter;

@Getter
public class RegistrationException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    private RegistrationException(final HttpStatus status, final String code, final String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static RegistrationException invalidClaim() {
        return new RegistrationException(HttpStatus.FORBIDDEN, "REGISTRATION_CLAIM_INVALID",
                "This registration link is invalid, already used, or no longer paid. "
                        + "Use a fresh email link for your current purchase, or sign in to your existing account.");
    }

    public static RegistrationException emailUnavailable() {
        return new RegistrationException(HttpStatus.SERVICE_UNAVAILABLE, "REGISTRATION_EMAIL_UNAVAILABLE",
                "The verification email could not be sent. Please try again later.");
    }
}
