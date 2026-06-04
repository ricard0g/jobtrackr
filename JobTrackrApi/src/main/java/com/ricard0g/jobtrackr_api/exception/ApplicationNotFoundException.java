package com.ricard0g.jobtrackr_api.exception;

public class ApplicationNotFoundException extends RuntimeException {

    public ApplicationNotFoundException(final Long userId, final Long applicationId) {
        super("Application not found with id: " + applicationId + " for user id: " + userId);
    }
}
