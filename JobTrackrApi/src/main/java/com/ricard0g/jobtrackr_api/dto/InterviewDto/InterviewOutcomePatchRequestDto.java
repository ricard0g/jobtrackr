package com.ricard0g.jobtrackr_api.dto.InterviewDto;

import com.ricard0g.jobtrackr_api.model.enums.InterviewOutcome;

import jakarta.validation.constraints.NotNull;

public record InterviewOutcomePatchRequestDto(@NotNull InterviewOutcome interviewOutcome) {}
