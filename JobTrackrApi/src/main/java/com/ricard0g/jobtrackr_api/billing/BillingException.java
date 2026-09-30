package com.ricard0g.jobtrackr_api.billing;

import org.springframework.http.HttpStatus;
import lombok.Getter;

@Getter
public class BillingException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public BillingException(final HttpStatus status, final String code, final String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static BillingException unavailable() {
        return new BillingException(HttpStatus.SERVICE_UNAVAILABLE, "BILLING_UNAVAILABLE",
                "Checkout is temporarily unavailable. Please try again later.");
    }

    public static BillingException expired() {
        return new BillingException(HttpStatus.CONFLICT, "CHECKOUT_EXPIRED", "Starting a fresh Stripe Checkout.");
    }

    public static BillingException conflict() {
        return new BillingException(HttpStatus.CONFLICT, "PURCHASE_ALREADY_EXISTS",
                "A purchase already exists for this email. Sign in or contact support to finish registration.");
    }
}
