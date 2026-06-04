package com.ricard0g.jobtrackr_api.dto;

import java.time.OffsetDateTime;

import com.ricard0g.jobtrackr_api.model.User;

public record UserResponseDto(
        Long userId,
        String userEmail,
        String userFirstName,
        String userLastName,
        OffsetDateTime userCreatedAt,
        OffsetDateTime userUpdatedAt) {

    public static UserResponseDto from(final User user) {
        return new UserResponseDto(
                user.getUserId(),
                user.getUserEmail(),
                user.getUserFirstName(),
                user.getUserLastName(),
                user.getUserCreatedAt(),
                user.getUserUpdatedAt());
    }
}
