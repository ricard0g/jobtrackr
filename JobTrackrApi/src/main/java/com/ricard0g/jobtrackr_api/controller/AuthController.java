package com.ricard0g.jobtrackr_api.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.config.security.RefreshTokenCookieService;
import com.ricard0g.jobtrackr_api.dto.AuthDto.AuthResponse;
import com.ricard0g.jobtrackr_api.dto.AuthDto.LoginRequestDto;
import com.ricard0g.jobtrackr_api.dto.AuthDto.RegisterRequestDto;
import com.ricard0g.jobtrackr_api.service.AuthService;
import com.ricard0g.jobtrackr_api.service.AuthService.AuthTokenPair;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Validated
public class AuthController {

    private final AuthService authService;
    private final RefreshTokenCookieService refreshTokenCookieService;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(
            @Valid @RequestBody final RegisterRequestDto registerRequestDto,
            final HttpServletResponse response) {
        final AuthTokenPair tokenPair = authService.register(registerRequestDto);
        refreshTokenCookieService.writeRefreshTokenCookie(
                response, tokenPair.refreshToken(), tokenPair.refreshExpiresAt());
        return ResponseEntity.status(HttpStatus.CREATED).body(tokenPair.authResponse());
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody final LoginRequestDto loginRequestDto,
            final HttpServletResponse response) {
        final AuthTokenPair tokenPair = authService.login(loginRequestDto);
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
}
