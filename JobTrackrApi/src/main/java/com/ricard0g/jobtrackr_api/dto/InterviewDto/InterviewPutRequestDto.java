package com.ricard0g.jobtrackr_api.dto.InterviewDto;

import java.time.OffsetDateTime;

import com.ricard0g.jobtrackr_api.model.enums.InterviewOutcome;
import com.ricard0g.jobtrackr_api.model.enums.InterviewType;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record InterviewPutRequestDto(
        @NotNull InterviewType interviewType,
        @NotNull OffsetDateTime interviewScheduledAt,
        @Size(max = 255) String interviewLocation,
        @Size(max = 10000) String interviewNotes,
        @NotNull InterviewOutcome interviewOutcome) {}
