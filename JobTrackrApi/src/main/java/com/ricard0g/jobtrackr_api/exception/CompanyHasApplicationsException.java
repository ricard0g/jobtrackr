package com.ricard0g.jobtrackr_api.exception;

public class CompanyHasApplicationsException extends RuntimeException {

    public CompanyHasApplicationsException(final Long companyId) {
        super("Cannot delete company with id: " + companyId + " because it has linked applications");
    }
}
