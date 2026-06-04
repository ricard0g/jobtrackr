package com.ricard0g.jobtrackr_api.exception;

public class DuplicateCompanyNameException extends RuntimeException {

    public DuplicateCompanyNameException(final Long userId, final String companyName) {
        super("Company name already exists for user id: " + userId + ": " + companyName);
    }
}
