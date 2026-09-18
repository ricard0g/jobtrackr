package com.ricard0g.jobtrackr_api.dto.UserDto;

import java.time.OffsetDateTime;
import java.util.Optional;

import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;

public record SignInMethodsResponseDto(
        PasswordSignInMethodDto password,
        GoogleSignInMethodDto google) {

    public static SignInMethodsResponseDto from(final User user, final Optional<UserIdentity> googleIdentity) {
        return new SignInMethodsResponseDto(
                passwordFrom(user),
                googleIdentity
                        .map(SignInMethodsResponseDto::connectedGoogle)
                        .orElseGet(GoogleSignInMethodDto::disconnected));
    }

    private static PasswordSignInMethodDto passwordFrom(final User user) {
        return new PasswordSignInMethodDto(user.hasPasswordSignIn(), user.getUserPasswordChangedAt());
    }

    private static GoogleSignInMethodDto connectedGoogle(final UserIdentity googleIdentity) {
        return new GoogleSignInMethodDto(
                true,
                googleIdentity.getProviderEmail(),
                googleIdentity.getLinkedAt(),
                googleIdentity.getLastUsedAt());
    }

    public record PasswordSignInMethodDto(boolean enabled, OffsetDateTime changedAt) {
    }

    public record GoogleSignInMethodDto(
            boolean connected,
            String providerEmail,
            OffsetDateTime linkedAt,
            OffsetDateTime lastUsedAt) {

        static GoogleSignInMethodDto disconnected() {
            return new GoogleSignInMethodDto(false, null, null, null);
        }
    }
}
