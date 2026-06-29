package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;
import java.util.Locale;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.config.security.JwtService;
import com.ricard0g.jobtrackr_api.dto.AuthDto.AuthResponse;
import com.ricard0g.jobtrackr_api.dto.AuthDto.LoginRequestDto;
import com.ricard0g.jobtrackr_api.dto.AuthDto.RegisterRequestDto;
import com.ricard0g.jobtrackr_api.dto.UserDto.UserResponseDto;
import com.ricard0g.jobtrackr_api.exception.DuplicateEmailException;
import com.ricard0g.jobtrackr_api.exception.InvalidRefreshTokenException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.service.RefreshTokenService.IssuedRefreshToken;
import com.ricard0g.jobtrackr_api.service.RefreshTokenService.RotationResult;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final AuthenticationManager authenticationManager;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public AuthTokenPair register(final RegisterRequestDto registerRequestDto) {
        final String email = normalizeEmail(registerRequestDto.email());

        if (userRepository.existsByUserEmail(email)) {
            throw new DuplicateEmailException("Email already exists");
        }

        final String passwordHash = passwordEncoder.encode(registerRequestDto.password());
        final User user = User.localAccount(email, passwordHash, registerRequestDto.displayName());

        try {
            final User savedUser = userRepository.save(user);
            return issueTokenPair(savedUser);
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateEmailException("Email already in use");
        }
    }

    @Transactional
    public AuthTokenPair login(final LoginRequestDto loginRequestDto) {
        final String email = normalizeEmail(loginRequestDto.email());

        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, loginRequestDto.password()));

        final User user = userRepository.findByUserEmail(email)
                .orElseThrow(() -> new IllegalStateException("Authenticated user not found"));

        user.setUserLastLoginAt(OffsetDateTime.now());
        final User savedUser = userRepository.save(user);

        return issueTokenPair(savedUser);
    }

    @Transactional
    public AuthTokenPair refresh(final String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw new InvalidRefreshTokenException("Refresh token is missing");
        }
        final RotationResult rotationResult = refreshTokenService.rotateRefreshToken(rawRefreshToken);
        final String accessToken = jwtService.generateAccessToken(rotationResult.user().getUserId());
        final AuthResponse authResponse = AuthResponse.of(
                accessToken,
                jwtService.getAccessExpirationSeconds(),
                UserResponseDto.from(rotationResult.user()));
        return new AuthTokenPair(authResponse, rotationResult.rawToken(), rotationResult.expiresAt());
    }

    @Transactional
    public void logout(final String rawRefreshToken) {
        if (rawRefreshToken != null) {
            refreshTokenService.revokeRefreshToken(rawRefreshToken);
        }
    }

    private AuthTokenPair issueTokenPair(final User user) {
        final String accessToken = jwtService.generateAccessToken(user.getUserId());
        final IssuedRefreshToken issuedRefreshToken = refreshTokenService.createRefreshToken(user);
        final AuthResponse authResponse = AuthResponse.of(
                accessToken,
                jwtService.getAccessExpirationSeconds(),
                UserResponseDto.from(user));
        return new AuthTokenPair(authResponse, issuedRefreshToken.rawToken(), issuedRefreshToken.expiresAt());
    }

    private String normalizeEmail(final String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public record AuthTokenPair(AuthResponse authResponse, String refreshToken, OffsetDateTime refreshExpiresAt) {
    }
}
