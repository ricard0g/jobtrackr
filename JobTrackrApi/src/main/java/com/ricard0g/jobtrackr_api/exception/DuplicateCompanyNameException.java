package com.ricard0g.jobtrackr_api.exception;

import java.util.UUID;

public class DuplicateCompanyNameException extends RuntimeException {

    public DuplicateCompanyNameException(final UUID userId, final String companyName) {
        super("Company name already exists for user id: " + userId + ": " + companyName);
    }
}
