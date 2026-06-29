package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.config.security.JwtProperties;
import com.ricard0g.jobtrackr_api.exception.InvalidRefreshTokenException;
import com.ricard0g.jobtrackr_api.exception.RefreshTokenReuseException;
import com.ricard0g.jobtrackr_api.model.RefreshToken;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.RefreshTokenRepository;
import com.ricard0g.jobtrackr_api.service.RefreshTokenService.RotationResult;

@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    private RefreshTokenService refreshTokenService;
    private User user;

    @BeforeEach
    void setUp() {
        final JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setRefreshExpirationMs(3_600_000L);
        refreshTokenService = new RefreshTokenService(refreshTokenRepository, jwtProperties);

        user = User.localAccount("user@example.com", "hash", "Test User");
        user.setUserId(UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
    }

    @Test
    void createRefreshToken_shouldPersistHashedToken() {
        when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(invocation -> invocation.getArgument(0));

        final RefreshTokenService.IssuedRefreshToken issuedRefreshToken = refreshTokenService.createRefreshToken(user);

        assertThat(issuedRefreshToken.rawToken()).isNotBlank();
        assertThat(issuedRefreshToken.expiresAt()).isAfter(OffsetDateTime.now());

        final ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(captor.capture());
        assertThat(captor.getValue().getTokenHash()).hasSize(64);
        assertThat(captor.getValue().getFamilyId()).isNotNull();
    }

    @Test
    void rotateRefreshToken_shouldIssueSuccessorAndRevokeCurrent() {
        when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(invocation -> {
            final RefreshToken token = invocation.getArgument(0);
            if (token.getRefreshTokenId() == null) {
                token.setRefreshTokenId(UUID.randomUUID());
            }
            return token;
        });

        final RefreshTokenService.IssuedRefreshToken issuedRefreshToken = refreshTokenService.createRefreshToken(user);
        final ArgumentCaptor<RefreshToken> createCaptor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(createCaptor.capture());
        final RefreshToken currentToken = createCaptor.getValue();
        currentToken.setRefreshTokenId(UUID.randomUUID());

        when(refreshTokenRepository.findByTokenHashForUpdate(currentToken.getTokenHash()))
                .thenReturn(Optional.of(currentToken));

        final RotationResult rotationResult = refreshTokenService.rotateRefreshToken(issuedRefreshToken.rawToken());

        assertThat(rotationResult.user()).isEqualTo(user);
        assertThat(rotationResult.rawToken()).isNotEqualTo(issuedRefreshToken.rawToken());
        assertThat(currentToken.isRevoked()).isTrue();
        assertThat(currentToken.getReplacedBy()).isNotNull();
    }

    @Test
    void rotateRefreshToken_shouldRejectUnknownToken() {
        when(refreshTokenRepository.findByTokenHashForUpdate(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> refreshTokenService.rotateRefreshToken("unknown-token"))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void rotateRefreshToken_shouldRevokeFamilyOnReuse() {
        final RefreshToken revokedToken = RefreshToken.create(
                user,
                "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
                UUID.randomUUID(),
                OffsetDateTime.now().plusHours(1));
        revokedToken.setRefreshTokenId(UUID.randomUUID());
        revokedToken.revoke(OffsetDateTime.now().minusMinutes(1));

        when(refreshTokenRepository.findByTokenHashForUpdate(any())).thenReturn(Optional.of(revokedToken));

        assertThatThrownBy(() -> refreshTokenService.rotateRefreshToken("reused-token-value"))
                .isInstanceOf(RefreshTokenReuseException.class);

        verify(refreshTokenRepository).revokeAllByFamilyId(eq(revokedToken.getFamilyId()), any(OffsetDateTime.class));
    }

    @Test
    void rotateRefreshToken_shouldRejectExpiredToken() {
        final RefreshToken expiredToken = RefreshToken.create(
                user,
                "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
                UUID.randomUUID(),
                OffsetDateTime.now().minusMinutes(1));
        expiredToken.setRefreshTokenId(UUID.randomUUID());

        when(refreshTokenRepository.findByTokenHashForUpdate(any())).thenReturn(Optional.of(expiredToken));
        when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertThatThrownBy(() -> refreshTokenService.rotateRefreshToken("expired-token-value"))
                .isInstanceOf(InvalidRefreshTokenException.class);

        assertThat(expiredToken.isRevoked()).isTrue();
    }
}
