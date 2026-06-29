package com.ricard0g.jobtrackr_api.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.config.security.JwtProperties;
import com.ricard0g.jobtrackr_api.exception.InvalidRefreshTokenException;
import com.ricard0g.jobtrackr_api.exception.RefreshTokenReuseException;
import com.ricard0g.jobtrackr_api.model.RefreshToken;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.RefreshTokenRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private static final int OPAQUE_TOKEN_BYTE_LENGTH = 32;

    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtProperties jwtProperties;
    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional
    public IssuedRefreshToken createRefreshToken(final User user) {
        final OffsetDateTime now = OffsetDateTime.now();
        final String rawToken = generateOpaqueToken();
        final String tokenHash = hashToken(rawToken);
        final UUID familyId = UUID.randomUUID();
        final OffsetDateTime expiresAt = now.plus(Duration.ofMillis(jwtProperties.getRefreshExpirationMs()));

        final RefreshToken refreshToken = RefreshToken.create(user, tokenHash, familyId, expiresAt);
        refreshTokenRepository.save(refreshToken);

        return new IssuedRefreshToken(rawToken, expiresAt);
    }

    @Transactional
    public RotationResult rotateRefreshToken(final String rawToken) {
        final OffsetDateTime now = OffsetDateTime.now();
        final String tokenHash = hashToken(rawToken);

        final RefreshToken currentToken = refreshTokenRepository.findByTokenHashForUpdate(tokenHash)
                .orElseThrow(() -> new InvalidRefreshTokenException("Refresh token is invalid"));

        if (currentToken.isRevoked()) {
            revokeFamily(currentToken.getFamilyId(), now);
            throw new RefreshTokenReuseException("Refresh token has already been used");
        }

        if (currentToken.isExpired(now)) {
            currentToken.revoke(now);
            refreshTokenRepository.save(currentToken);
            throw new InvalidRefreshTokenException("Refresh token has expired");
        }

        final String newRawToken = generateOpaqueToken();
        final String newTokenHash = hashToken(newRawToken);
        final OffsetDateTime expiresAt = now.plus(Duration.ofMillis(jwtProperties.getRefreshExpirationMs()));

        final RefreshToken successor = RefreshToken.create(
                currentToken.getUser(),
                newTokenHash,
                currentToken.getFamilyId(),
                expiresAt);
        final RefreshToken savedSuccessor = refreshTokenRepository.save(successor);

        currentToken.revoke(now);
        currentToken.setReplacedBy(savedSuccessor);
        refreshTokenRepository.save(currentToken);

        return new RotationResult(currentToken.getUser(), newRawToken, expiresAt);
    }

    @Transactional
    public void revokeRefreshToken(final String rawToken) {
        final OffsetDateTime now = OffsetDateTime.now();
        final String tokenHash = hashToken(rawToken);

        refreshTokenRepository.findByTokenHashForUpdate(tokenHash).ifPresent(token -> {
            if (!token.isRevoked()) {
                token.revoke(now);
                refreshTokenRepository.save(token);
            }
        });
    }

    @Transactional
    public void revokeFamily(final UUID familyId, final OffsetDateTime revokedAt) {
        refreshTokenRepository.revokeAllByFamilyId(familyId, revokedAt);
    }

    private String generateOpaqueToken() {
        final byte[] tokenBytes = new byte[OPAQUE_TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(tokenBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    }

    private String hashToken(final String rawToken) {
        try {
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            final byte[] hashBytes = digest.digest(rawToken.getBytes());
            return HexFormat.of().formatHex(hashBytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available", exception);
        }
    }

    public record IssuedRefreshToken(String rawToken, OffsetDateTime expiresAt) {
    }

    public record RotationResult(User user, String rawToken, OffsetDateTime expiresAt) {
    }
}
