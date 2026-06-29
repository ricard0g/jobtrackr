package com.ricard0g.jobtrackr_api.dto.UserDto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.ricard0g.jobtrackr_api.model.User;

public record UserResponseDto(
        UUID userId,
        String userEmail,
        String userDisplayName,
        String userPictureUrl,
        boolean userEnabled,
        boolean userLocked,
        OffsetDateTime userDeletedAt,
        OffsetDateTime userPasswordChangedAt,
        OffsetDateTime userLastLoginAt,
        OffsetDateTime userCreatedAt,
        OffsetDateTime userUpdatedAt) {

    public static UserResponseDto from(final User user) {
        return new UserResponseDto(
                user.getUserId(),
                user.getUserEmail(),
                user.getUserDisplayName(),
                user.getUserPictureUrl(),
                user.isUserEnabled(),
                user.isUserLocked(),
                user.getUserDeletedAt(),
                user.getUserPasswordChangedAt(),
                user.getUserLastLoginAt(),
                user.getUserCreatedAt(),
                user.getUserUpdatedAt());
    }
}
