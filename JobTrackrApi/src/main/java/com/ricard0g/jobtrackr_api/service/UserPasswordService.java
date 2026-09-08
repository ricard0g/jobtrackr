package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.UserDto.UserPasswordRequestDto;
import com.ricard0g.jobtrackr_api.exception.CurrentPasswordRequiredException;
import com.ricard0g.jobtrackr_api.exception.PasswordUnchangedException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthPurpose;
import com.ricard0g.jobtrackr_api.service.AuthService.AuthTokenPair;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserPasswordService {

    private static final String CHANGE_PASSWORD_ACTION = "CHANGE_PASSWORD";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final AuthService authService;
    private final PasswordCreationGrantService passwordCreationGrantService;

    @Transactional
    public AuthTokenPair changePassword(
            final UUID userId,
            final UserPasswordRequestDto request,
            final HttpServletRequest httpRequest,
            final HttpServletResponse httpResponse) {
        final User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));

        if (!user.hasPasswordSignIn()) {
            passwordCreationGrantService.consume(httpRequest, userId);
            final AuthTokenPair created =
                    persistPassword(user, request.newPassword(), OAuthPurpose.CREATE_PASSWORD.name());
            passwordCreationGrantService.discard(httpRequest, httpResponse);
            return created;
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

        return persistPassword(user, request.newPassword(), CHANGE_PASSWORD_ACTION);
    }

    private AuthTokenPair persistPassword(
            final User user,
            final String newPassword,
            final String action) {
        user.setUserPasswordHash(passwordEncoder.encode(newPassword));
        user.setUserPasswordChangedAt(OffsetDateTime.now());
        user.advanceAuthenticationVersion();
        userRepository.save(user);
        refreshTokenService.revokeAllForUser(user.getUserId());

        log.info("[UserPasswordService] - {}: outcome: succeeded, userId: {}", action, user.getUserId());
        return authService.issueReplacementSession(user);
    }
}
