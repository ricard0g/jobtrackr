package com.ricard0g.jobtrackr_api.dto.UserDto;

import jakarta.validation.constraints.NotBlank;

public record GoogleDisconnectRequestDto(@NotBlank String currentPassword) {
}
