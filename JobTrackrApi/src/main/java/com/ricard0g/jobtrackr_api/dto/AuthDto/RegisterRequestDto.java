package com.ricard0g.jobtrackr_api.dto.AuthDto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterRequestDto(
        @NotNull @Email String email,
        @NotNull @Size(min = 8, max = 72) String password,
        String displayName
) {}
