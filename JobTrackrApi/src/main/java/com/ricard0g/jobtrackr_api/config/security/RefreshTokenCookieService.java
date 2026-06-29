package com.ricard0g.jobtrackr_api.config.security;

import java.time.Duration;
import java.time.OffsetDateTime;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RefreshTokenCookieService {

    private static final String AUTH_COOKIE_PATH = "/auth";

    private final JwtProperties jwtProperties;

    public void writeRefreshTokenCookie(
            final HttpServletResponse response,
            final String rawToken,
            final OffsetDateTime expiresAt) {
        final ResponseCookie cookie = ResponseCookie.from(jwtProperties.getRefreshCookieName(), rawToken)
                .httpOnly(true)
                .secure(jwtProperties.isRefreshCookieSecure())
                .path(AUTH_COOKIE_PATH)
                .maxAge(Duration.between(OffsetDateTime.now(), expiresAt))
                .sameSite(jwtProperties.getRefreshCookieSameSite())
                .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }

    public String readRefreshTokenCookie(final HttpServletRequest request) {
        final Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (final Cookie cookie : cookies) {
            if (jwtProperties.getRefreshCookieName().equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    public void clearRefreshTokenCookie(final HttpServletResponse response) {
        final ResponseCookie cookie = ResponseCookie.from(jwtProperties.getRefreshCookieName(), "")
                .httpOnly(true)
                .secure(jwtProperties.isRefreshCookieSecure())
                .path(AUTH_COOKIE_PATH)
                .maxAge(0)
                .sameSite(jwtProperties.getRefreshCookieSameSite())
                .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }
}
