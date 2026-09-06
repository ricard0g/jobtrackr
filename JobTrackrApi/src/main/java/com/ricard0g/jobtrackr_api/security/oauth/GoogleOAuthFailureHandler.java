package com.ricard0g.jobtrackr_api.security.oauth;

import java.io.IOException;

import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import com.ricard0g.jobtrackr_api.config.security.GoogleAuthProperties;
import com.ricard0g.jobtrackr_api.config.security.OauthSessionCookieService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class GoogleOAuthFailureHandler implements AuthenticationFailureHandler {

    private static final String ACCESS_DENIED = "access_denied";
    private static final String AUTHORIZATION_REQUEST_NOT_FOUND = "authorization_request_not_found";
    private static final String INVALID_STATE_PARAMETER = "invalid_state_parameter";

    private final OauthSessionCookieService oauthSessionCookieService;
    private final GoogleAuthProperties googleAuthProperties;

    @Override
    public void onAuthenticationFailure(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final AuthenticationException exception) throws IOException {
        GoogleOAuthSuccessHandler.applyCallbackHeaders(response);
        final HttpSession session = request.getSession(false);
        final String failurePath = sessionFailurePath(session);
        final OAuthResultCode resultCode = resultCode(exception);
        log.info(
                "[GoogleSignIn] - COMPLETE: outcome: {}, purpose: {}",
                resultCode.queryValue(),
                OAuthPurpose.SIGN_IN);
        if (session != null) {
            session.invalidate();
        }
        oauthSessionCookieService.clearOauthSessionCookie(response);
        response.sendRedirect(OAuthRedirects.failureLocation(
                googleAuthProperties.normalizedPublicOrigin(),
                failurePath,
                resultCode));
    }

    private static OAuthResultCode resultCode(final AuthenticationException exception) {
        if (!(exception instanceof OAuth2AuthenticationException oauthException)) {
            return OAuthResultCode.FAILED;
        }
        final OAuth2Error error = oauthException.getError();
        if (error == null || error.getErrorCode() == null) {
            return OAuthResultCode.FAILED;
        }
        return switch (error.getErrorCode()) {
            case ACCESS_DENIED -> OAuthResultCode.CANCELLED;
            case AUTHORIZATION_REQUEST_NOT_FOUND, INVALID_STATE_PARAMETER -> OAuthResultCode.EXPIRED;
            default -> OAuthResultCode.FAILED;
        };
    }

    private static String sessionFailurePath(final HttpSession session) {
        if (session == null) {
            return OAuthSession.LOGIN_FAILURE_PATH;
        }
        final Object failurePath = session.getAttribute(OAuthSession.FAILURE_PATH_ATTRIBUTE);
        if (failurePath instanceof String value) {
            return value;
        }
        return OAuthSession.LOGIN_FAILURE_PATH;
    }
}
