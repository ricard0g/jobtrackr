package com.ricard0g.jobtrackr_api.config.security;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import com.ricard0g.jobtrackr_api.security.oauth.OAuthSession;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class OauthSessionCookieService {

    private final JwtProperties jwtProperties;

    public void clearOauthSessionCookie(final HttpServletResponse response) {
        final ResponseCookie cookie = ResponseCookie.from(OAuthSession.COOKIE_NAME, "")
                .httpOnly(true)
                .secure(jwtProperties.isRefreshCookieSecure())
                .path(OAuthSession.COOKIE_PATH)
                .maxAge(0)
                .sameSite("Lax")
                .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }
}
