package com.ricard0g.jobtrackr_api.dto.AuthDto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;

public record LoginRequestDto(
        @NotNull @Email String email,
        @NotNull String password) {
}
