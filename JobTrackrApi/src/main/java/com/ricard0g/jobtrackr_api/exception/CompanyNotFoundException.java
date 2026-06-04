package com.ricard0g.jobtrackr_api.exception;

public class CompanyNotFoundException extends RuntimeException {

    public CompanyNotFoundException(final Long userId, final Long companyId) {
        super("Company not found with id: " + companyId + " for user id: " + userId);
    }
}
