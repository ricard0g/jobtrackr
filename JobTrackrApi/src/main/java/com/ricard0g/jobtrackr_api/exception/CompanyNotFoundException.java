package com.ricard0g.jobtrackr_api.exception;

import java.util.UUID;

public class CompanyNotFoundException extends RuntimeException {

    public CompanyNotFoundException(final UUID userId, final Long companyId) {
        super("Company not found with id: " + companyId + " for user id: " + userId);
    }
}
