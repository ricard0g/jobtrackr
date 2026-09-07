package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.UserDto.UserPasswordRequestDto;
import com.ricard0g.jobtrackr_api.exception.CurrentPasswordRequiredException;
import com.ricard0g.jobtrackr_api.exception.PasswordCreationGrantRequiredException;
import com.ricard0g.jobtrackr_api.exception.PasswordUnchangedException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.service.AuthService.AuthTokenPair;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserPasswordService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final AuthService authService;

    @Transactional
    public AuthTokenPair changePassword(final UUID userId, final UserPasswordRequestDto request) {
        final User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));

        if (!user.hasPasswordSignIn()) {
            throw new PasswordCreationGrantRequiredException();
        }

        final String currentPassword = request.currentPassword();
        final boolean missingCurrentPassword = currentPassword == null || currentPassword.isBlank();
        if (missingCurrentPassword) {
            throw new CurrentPasswordRequiredException();
        }

        if (!passwordEncoder.matches(currentPassword, user.getUserPasswordHash())) {
            throw new BadCredentialsException("Invalid current password");
        }

        if (passwordEncoder.matches(request.newPassword(), user.getUserPasswordHash())) {
            throw new PasswordUnchangedException();
        }

        user.setUserPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setUserPasswordChangedAt(OffsetDateTime.now());
        user.advanceAuthenticationVersion();
        userRepository.save(user);
        refreshTokenService.revokeAllForUser(userId);

        log.info("[UserPasswordService] - CHANGE_PASSWORD: outcome: succeeded, userId: {}", userId);
        return authService.issueReplacementSession(user);
    }
}
