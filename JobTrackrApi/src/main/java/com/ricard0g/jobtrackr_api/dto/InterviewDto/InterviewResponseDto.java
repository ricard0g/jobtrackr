package com.ricard0g.jobtrackr_api.dto.InterviewDto;

import java.time.OffsetDateTime;

import com.ricard0g.jobtrackr_api.model.Interview;
import com.ricard0g.jobtrackr_api.model.enums.InterviewOutcome;
import com.ricard0g.jobtrackr_api.model.enums.InterviewType;

public record InterviewResponseDto(
        Long interviewId,
        Long applicationId,
        InterviewType interviewType,
        OffsetDateTime interviewScheduledAt,
        String interviewLocation,
        String interviewNotes,
        InterviewOutcome interviewOutcome,
        OffsetDateTime interviewCreatedAt,
        OffsetDateTime interviewUpdatedAt) {

    public static InterviewResponseDto from(final Interview interview, final Long applicationId) {
        return new InterviewResponseDto(
                interview.getInterviewId(),
                applicationId,
                interview.getInterviewType(),
                interview.getInterviewScheduledAt(),
                interview.getInterviewLocation(),
                interview.getInterviewNotes(),
                interview.getInterviewOutcome(),
                interview.getInterviewCreatedAt(),
                interview.getInterviewUpdatedAt());
    }
}
