package com.ricard0g.jobtrackr_api.exception;

public class InterviewNotFoundException extends RuntimeException {

    public InterviewNotFoundException(final Long userId, final Long applicationId, final Long interviewId) {
        super("Interview not found with id: " + interviewId + " for application id: " + applicationId
                + " and user id: " + userId);
    }
}
