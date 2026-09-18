package com.ricard0g.jobtrackr_api.dto.UserDto;

import jakarta.validation.constraints.Size;

public record UserPatchRequestDto(
        @Size(max = UserPatchRequestDto.DISPLAY_NAME_MAX_LENGTH) String displayName,
        String userEmail,
        String email) {

    public static final int DISPLAY_NAME_MAX_LENGTH = 160;

    public boolean attemptsEmailMutation() {
        final boolean userEmailPresent = userEmail != null;
        final boolean emailPresent = email != null;
        return userEmailPresent || emailPresent;
    }
}
