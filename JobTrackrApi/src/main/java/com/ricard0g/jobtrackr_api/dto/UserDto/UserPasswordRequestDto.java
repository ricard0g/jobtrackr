package com.ricard0g.jobtrackr_api.dto.UserDto;

import com.ricard0g.jobtrackr_api.validation.ValidPassword;

import jakarta.validation.constraints.NotNull;

public record UserPasswordRequestDto(
        String currentPassword,
        @NotNull @ValidPassword String newPassword) {
}
