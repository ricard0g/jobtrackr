package com.ricard0g.jobtrackr_api.security.oauth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import com.ricard0g.jobtrackr_api.config.security.GoogleAuthProperties;
import com.ricard0g.jobtrackr_api.config.security.OauthSessionCookieService;
import com.ricard0g.jobtrackr_api.config.security.RefreshTokenCookieService;
import com.ricard0g.jobtrackr_api.exception.RateLimitedException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationAction;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimitKey;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;
import com.ricard0g.jobtrackr_api.service.RefreshTokenService;

import jakarta.annotation.Nonnull;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RequiredArgsConstructor
public class GoogleOAuthStartFilter extends OncePerRequestFilter {

    static final String AUTHORIZATION_PATH = "/api/v1/auth/oauth2/authorization/google";
    private static final String UNKNOWN_CLIENT_IP = "unknown";
    private static final String GET_METHOD = "GET";

    private final AuthenticationRateLimiter authenticationRateLimiter;
    private final OauthSessionCookieService oauthSessionCookieService;
    private final RefreshTokenCookieService refreshTokenCookieService;
    private final RefreshTokenService refreshTokenService;
    private final GoogleAuthProperties googleAuthProperties;

    @Override
    protected boolean shouldNotFilter(@Nonnull final HttpServletRequest request) {
        final boolean matchingPath = AUTHORIZATION_PATH.equals(request.getRequestURI());
        final boolean matchingMethod = GET_METHOD.equals(request.getMethod());
        return !(matchingPath && matchingMethod);
    }

    @Override
    protected void doFilterInternal(
            @Nonnull final HttpServletRequest request,
            @Nonnull final HttpServletResponse response,
            @Nonnull final FilterChain filterChain) throws ServletException, IOException {
        try {
            authenticationRateLimiter.consume(
                    AuthenticationAction.GOOGLE_START,
                    AuthenticationRateLimitKey.clientIp(clientIp(request)));
        } catch (RateLimitedException exception) {
            writeRateLimited(response, exception);
            return;
        }

        if (isProtectedHandshakeSession(request)) {
            if (!preserveProtectedOauthSession(request)) {
                rejectExpiredProtectedStart(request, response);
                return;
            }
        } else {
            replaceOauthSession(request, response);
        }
        filterChain.doFilter(request, response);
    }

    private boolean isProtectedHandshakeSession(final HttpServletRequest request) {
        final HttpSession session = request.getSession(false);
        final OAuthPurpose purpose = protectedPurpose(session);
        if (purpose == null) {
            return false;
        }
        return session.getAttribute(OAuthSession.ISSUED_AT_ATTRIBUTE) == null;
    }

    private boolean preserveProtectedOauthSession(final HttpServletRequest request) {
        final HttpSession session = request.getSession(false);
        final OAuthPurpose purpose = protectedPurpose(session);
        if (purpose == null) {
            return false;
        }
        final Object boundUserId = session.getAttribute(OAuthSession.USER_ID_ATTRIBUTE);
        if (!(boundUserId instanceof String boundUserIdValue)) {
            return false;
        }
        final UUID refreshUserId = refreshTokenService
                .findActiveUser(refreshTokenCookieService.readRefreshTokenCookie(request))
                .map(User::getUserId)
                .orElse(null);
        final boolean boundUserMatchesRefresh =
                refreshUserId != null && boundUserIdValue.equals(refreshUserId.toString());
        if (!boundUserMatchesRefresh) {
            return false;
        }
        session.setMaxInactiveInterval(OAuthSession.TIMEOUT_SECONDS);
        return true;
    }

    private void rejectExpiredProtectedStart(final HttpServletRequest request, final HttpServletResponse response)
            throws IOException {
        final HttpSession session = request.getSession(false);
        final OAuthPurpose purpose = protectedPurpose(session);
        if (session != null) {
            session.invalidate();
        }
        oauthSessionCookieService.clearOauthSessionCookie(response);
        log.info(
                "[GoogleSignIn] - START: outcome: expired, purpose: {}",
                purpose == null ? OAuthPurpose.LINK_GOOGLE : purpose);
        response.sendRedirect(OAuthRedirects.failureLocation(
                googleAuthProperties.normalizedPublicOrigin(),
                OAuthSession.ACCOUNT_SETTINGS_PATH,
                OAuthResultCode.EXPIRED));
    }

    private static OAuthPurpose protectedPurpose(final HttpSession session) {
        if (session == null) {
            return null;
        }
        final Object purposeValue = session.getAttribute(OAuthSession.PURPOSE_ATTRIBUTE);
        if (OAuthPurpose.LINK_GOOGLE.name().equals(purposeValue)) {
            return OAuthPurpose.LINK_GOOGLE;
        }
        if (OAuthPurpose.CREATE_PASSWORD.name().equals(purposeValue)) {
            return OAuthPurpose.CREATE_PASSWORD;
        }
        return null;
    }

    private void replaceOauthSession(final HttpServletRequest request, final HttpServletResponse response) {
        final HttpSession existingSession = request.getSession(false);
        if (existingSession != null) {
            existingSession.invalidate();
            oauthSessionCookieService.clearOauthSessionCookie(response);
        }

        final HttpSession session = request.getSession(true);
        session.setMaxInactiveInterval(OAuthSession.TIMEOUT_SECONDS);
        session.setAttribute(OAuthSession.PURPOSE_ATTRIBUTE, OAuthPurpose.SIGN_IN.name());
        session.setAttribute(
                OAuthSession.RETURN_TO_ATTRIBUTE,
                OAuthRedirects.sanitizeReturnTo(request.getParameter("returnTo")));
        session.setAttribute(
                OAuthSession.FAILURE_PATH_ATTRIBUTE,
                OAuthRedirects.failurePathForScreen(request.getParameter("screen")));
    }

    private void writeRateLimited(
            final HttpServletResponse response,
            final RateLimitedException exception) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(exception.retryAfterSeconds()));
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"code\":\"RATE_LIMITED\",\"message\":\""
                        + exception.getMessage()
                        + "\",\"fieldErrors\":null}");
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
