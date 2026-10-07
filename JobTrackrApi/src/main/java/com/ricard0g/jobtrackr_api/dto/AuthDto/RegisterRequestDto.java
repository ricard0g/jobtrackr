package com.ricard0g.jobtrackr_api.dto.AuthDto;

import com.ricard0g.jobtrackr_api.validation.ValidPassword;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterRequestDto(
        @NotNull @Email String email,
        @NotNull @ValidPassword String password,
        @Size(max = 160) String displayName,
        @Size(max = 256) String verificationToken
) {}
