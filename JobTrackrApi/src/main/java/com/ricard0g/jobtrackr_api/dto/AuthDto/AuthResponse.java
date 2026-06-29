package com.ricard0g.jobtrackr_api.dto.AuthDto;

import com.ricard0g.jobtrackr_api.dto.UserDto.UserResponseDto;

public record AuthResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        UserResponseDto user) {

    public static AuthResponse of(
            final String accessToken,
            final long expiresInSeconds,
            final UserResponseDto user) {
        return new AuthResponse(accessToken, "Bearer", expiresInSeconds, user);
    }
}
