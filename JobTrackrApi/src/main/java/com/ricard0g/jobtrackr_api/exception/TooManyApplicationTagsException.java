package com.ricard0g.jobtrackr_api.exception;

public class TooManyApplicationTagsException extends RuntimeException {

    public TooManyApplicationTagsException(final Long applicationId, final int maxTags) {
        super("Application " + applicationId + " cannot have more than " + maxTags + " tags");
    }
}
