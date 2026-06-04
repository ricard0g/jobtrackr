package com.ricard0g.jobtrackr_api.exception;

public class UserNotFoundException extends RuntimeException {

    public UserNotFoundException(final Long userId) {
        super("User not found with id: " + userId);
    }
}
