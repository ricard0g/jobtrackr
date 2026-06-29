package com.ricard0g.jobtrackr_api.exception;

import java.util.UUID;

public class ApplicationNotFoundException extends RuntimeException {

    public ApplicationNotFoundException(final UUID userId, final Long applicationId) {
        super("Application not found with id: " + applicationId + " for user id: " + userId);
    }
}
