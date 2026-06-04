package com.ricard0g.jobtrackr_api.exception;

import java.math.BigDecimal;

public class InvalidApplicationSalaryRangeException extends RuntimeException {

    public InvalidApplicationSalaryRangeException(
            final BigDecimal applicationSalaryMin, final BigDecimal applicationSalaryMax) {
        super("Application salary max must be greater than or equal to salary min: min="
                + applicationSalaryMin
                + ", max="
                + applicationSalaryMax);
    }
}
