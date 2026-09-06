package com.ricard0g.jobtrackr_api.security.oauth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import com.ricard0g.jobtrackr_api.config.security.OauthSessionCookieService;
import com.ricard0g.jobtrackr_api.exception.RateLimitedException;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationAction;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimitKey;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;

import jakarta.annotation.Nonnull;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class GoogleOAuthStartFilter extends OncePerRequestFilter {

    static final String AUTHORIZATION_PATH = "/api/v1/auth/oauth2/authorization/google";
    private static final String UNKNOWN_CLIENT_IP = "unknown";
    private static final String GET_METHOD = "GET";

    private final AuthenticationRateLimiter authenticationRateLimiter;
    private final OauthSessionCookieService oauthSessionCookieService;

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

        replaceOauthSession(request, response);
        filterChain.doFilter(request, response);
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
