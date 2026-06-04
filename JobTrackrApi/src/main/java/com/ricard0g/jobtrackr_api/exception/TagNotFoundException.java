package com.ricard0g.jobtrackr_api.exception;

public class TagNotFoundException extends RuntimeException {

    public TagNotFoundException(final Long tagId) {
        super("Tag not found with id: " + tagId);
    }
}
