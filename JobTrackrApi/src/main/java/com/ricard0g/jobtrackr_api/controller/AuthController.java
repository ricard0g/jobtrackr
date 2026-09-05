package com.ricard0g.jobtrackr_api.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.config.security.RefreshTokenCookieService;
import com.ricard0g.jobtrackr_api.dto.AuthDto.AuthResponse;
import com.ricard0g.jobtrackr_api.dto.AuthDto.LoginRequestDto;
import com.ricard0g.jobtrackr_api.dto.AuthDto.RegisterRequestDto;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationAction;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimitKey;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;
import com.ricard0g.jobtrackr_api.service.AuthService;
import com.ricard0g.jobtrackr_api.service.AuthService.AuthTokenPair;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Validated
public class AuthController {

    private static final String UNKNOWN_CLIENT_IP = "unknown";

    private final AuthService authService;
    private final RefreshTokenCookieService refreshTokenCookieService;
    private final AuthenticationRateLimiter authenticationRateLimiter;

    @GetMapping("/csrf")
    public CsrfToken csrfToken(final CsrfToken token) {
        return token;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(
            @Valid @RequestBody final RegisterRequestDto registerRequestDto,
            final HttpServletRequest request,
            final HttpServletResponse response) {
        authenticationRateLimiter.consume(
                AuthenticationAction.REGISTRATION,
                AuthenticationRateLimitKey.clientIp(clientIp(request)));
        final AuthTokenPair tokenPair = authService.register(registerRequestDto);
        refreshTokenCookieService.writeRefreshTokenCookie(
                response, tokenPair.refreshToken(), tokenPair.refreshExpiresAt());
        return ResponseEntity.status(HttpStatus.CREATED).body(tokenPair.authResponse());
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody final LoginRequestDto loginRequestDto,
            final HttpServletRequest request,
            final HttpServletResponse response) {
        final AuthenticationRateLimitKey loginKey = AuthenticationRateLimitKey.emailAndClientIp(
                loginRequestDto.email(), clientIp(request));
        authenticationRateLimiter.consume(AuthenticationAction.PASSWORD_LOGIN, loginKey);
        final AuthTokenPair tokenPair = authService.login(loginRequestDto);
        authenticationRateLimiter.reset(AuthenticationAction.PASSWORD_LOGIN, loginKey);
        refreshTokenCookieService.writeRefreshTokenCookie(
                response, tokenPair.refreshToken(), tokenPair.refreshExpiresAt());
        return ResponseEntity.ok(tokenPair.authResponse());
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            final HttpServletRequest request,
            final HttpServletResponse response) {
        final String rawRefreshToken = refreshTokenCookieService.readRefreshTokenCookie(request);
        final AuthTokenPair tokenPair = authService.refresh(rawRefreshToken);
        refreshTokenCookieService.writeRefreshTokenCookie(
                response, tokenPair.refreshToken(), tokenPair.refreshExpiresAt());
        return ResponseEntity.ok(tokenPair.authResponse());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            final HttpServletRequest request,
            final HttpServletResponse response) {
        final String rawRefreshToken = refreshTokenCookieService.readRefreshTokenCookie(request);
        authService.logout(rawRefreshToken);
        refreshTokenCookieService.clearRefreshTokenCookie(response);
        return ResponseEntity.noContent().build();
    }

    private static String clientIp(final HttpServletRequest request) {
        final String remoteAddr = request.getRemoteAddr();
        final boolean missingRemoteAddr = remoteAddr == null || remoteAddr.isBlank();
        if (missingRemoteAddr) {
            return UNKNOWN_CLIENT_IP;
        }
        return remoteAddr;
    }
}
