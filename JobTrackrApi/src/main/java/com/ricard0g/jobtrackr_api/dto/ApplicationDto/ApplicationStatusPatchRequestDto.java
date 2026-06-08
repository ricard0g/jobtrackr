package com.ricard0g.jobtrackr_api.dto.ApplicationDto;

import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;

import jakarta.validation.constraints.NotNull;

public record ApplicationStatusPatchRequestDto(@NotNull ApplicationStatus applicationStatus) {}
