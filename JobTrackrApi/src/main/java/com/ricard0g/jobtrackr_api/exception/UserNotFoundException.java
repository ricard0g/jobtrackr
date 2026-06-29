package com.ricard0g.jobtrackr_api.exception;

import java.util.UUID;

public class UserNotFoundException extends RuntimeException {

    public UserNotFoundException(final UUID userId) {
        super("User not found with id: " + userId);
    }
}
