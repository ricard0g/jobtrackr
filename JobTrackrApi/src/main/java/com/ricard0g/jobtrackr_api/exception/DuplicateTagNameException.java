package com.ricard0g.jobtrackr_api.exception;

public class DuplicateTagNameException extends RuntimeException {

    public DuplicateTagNameException(final String tagName) {
        super("Tag name already exists: " + tagName);
    }
}
