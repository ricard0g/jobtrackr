package com.ricard0g.jobtrackr_api.service;

import java.util.UUID;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.exception.GoogleDisconnectNotAllowedException;
import com.ricard0g.jobtrackr_api.exception.GoogleIdentityNotConnectedException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.service.AuthService.AuthTokenPair;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class GoogleDisconnectService {

    private static final String DISCONNECT_EVENT = "GOOGLE_DISCONNECT";

    private final UserRepository userRepository;
    private final UserIdentityRepository userIdentityRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final AuthService authService;

    @Transactional
    public AuthTokenPair disconnect(final UUID userId, final String currentPassword) {
        final User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));
        if (!user.hasPasswordSignIn()) {
            throw new GoogleDisconnectNotAllowedException();
        }
        if (!passwordEncoder.matches(currentPassword, user.getUserPasswordHash())) {
            throw new BadCredentialsException("Invalid current password");
        }

        final UserIdentity identity = userIdentityRepository
                .findByUser_UserIdAndProvider(userId, IdentityProvider.GOOGLE)
                .orElseThrow(GoogleIdentityNotConnectedException::new);

        userIdentityRepository.delete(identity);
        user.advanceAuthenticationVersion();
        userRepository.save(user);
        refreshTokenService.revokeAllForUser(userId);

        log.info("[GoogleDisconnect] - {}: outcome: succeeded, userId: {}", DISCONNECT_EVENT, userId);
        return authService.issueReplacementSession(user);
    }
}
