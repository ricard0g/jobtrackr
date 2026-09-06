package com.ricard0g.jobtrackr_api.security.oauth;

import java.io.IOException;
import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import com.ricard0g.jobtrackr_api.config.security.GoogleAuthProperties;
import com.ricard0g.jobtrackr_api.config.security.OauthSessionCookieService;
import com.ricard0g.jobtrackr_api.config.security.RefreshTokenCookieService;
import com.ricard0g.jobtrackr_api.exception.GoogleSignInRejectedException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.service.AuthService;
import com.ricard0g.jobtrackr_api.service.AuthService.AuthTokenPair;
import com.ricard0g.jobtrackr_api.service.GoogleSignInService;
import com.ricard0g.jobtrackr_api.service.RefreshTokenService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class GoogleOAuthSuccessHandler implements AuthenticationSuccessHandler {

    private static final String CACHE_CONTROL_NO_STORE = "no-store";
    private static final String REFERRER_POLICY_NO_REFERRER = "no-referrer";

    private final GoogleSignInService googleSignInService;
    private final AuthService authService;
    private final RefreshTokenService refreshTokenService;
    private final RefreshTokenCookieService refreshTokenCookieService;
    private final OauthSessionCookieService oauthSessionCookieService;
    private final GoogleAuthProperties googleAuthProperties;

    @Override
    public void onAuthenticationSuccess(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final Authentication authentication) throws IOException {
        applyCallbackHeaders(response);
        final HttpSession session = request.getSession(false);
        final String failurePath = sessionFailurePath(session);
        final String returnTo = sessionReturnTo(session);

        try {
            requireSignInPurpose(session);
            final OidcUser oidcUser = requireOidcUser(authentication);
            final String subject = oidcUser.getSubject();
            final String email = oidcUser.getEmail();
            final boolean emailVerified = Boolean.TRUE.equals(oidcUser.getEmailVerified());
            final boolean missingIdentityClaims = isBlank(subject) || isBlank(email) || !emailVerified;
            if (missingIdentityClaims) {
                throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
            }

            final User signedInUser = googleSignInService.requireReturningGoogleUser(subject);
            refuseToReplaceDifferentUser(request, signedInUser);
            googleSignInService.recordSuccessfulGoogleUse(subject, email);

            final AuthTokenPair tokenPair = authService.issueSession(signedInUser);
            refreshTokenCookieService.writeRefreshTokenCookie(
                    response,
                    tokenPair.refreshToken(),
                    tokenPair.refreshExpiresAt());
            log.info(
                    "[GoogleSignIn] - COMPLETE: outcome: success, purpose: {}, userId: {}",
                    OAuthPurpose.SIGN_IN,
                    signedInUser.getUserId());
            terminateOauthSession(request, response);
            response.sendRedirect(OAuthRedirects.successLocation(
                    googleAuthProperties.normalizedPublicOrigin(),
                    returnTo));
        } catch (GoogleSignInRejectedException exception) {
            redirectFailure(request, response, failurePath, exception.resultCode());
        } catch (RuntimeException exception) {
            log.warn(
                    "[GoogleSignIn] - COMPLETE: outcome: failed, purpose: {}, errorMessage: {}",
                    OAuthPurpose.SIGN_IN,
                    exception.getClass().getSimpleName());
            redirectFailure(request, response, failurePath, OAuthResultCode.FAILED);
        }
    }

    private void refuseToReplaceDifferentUser(final HttpServletRequest request, final User signedInUser) {
        final UUID currentUserId = refreshTokenService
                .findActiveUser(refreshTokenCookieService.readRefreshTokenCookie(request))
                .map(User::getUserId)
                .orElse(null);
        if (currentUserId == null) {
            return;
        }
        if (!currentUserId.equals(signedInUser.getUserId())) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
    }

    private void redirectFailure(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final String failurePath,
            final OAuthResultCode resultCode) throws IOException {
        log.info(
                "[GoogleSignIn] - COMPLETE: outcome: {}, purpose: {}",
                resultCode.queryValue(),
                OAuthPurpose.SIGN_IN);
        terminateOauthSession(request, response);
        response.sendRedirect(OAuthRedirects.failureLocation(
                googleAuthProperties.normalizedPublicOrigin(),
                failurePath,
                resultCode));
    }

    private void terminateOauthSession(final HttpServletRequest request, final HttpServletResponse response) {
        final HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        oauthSessionCookieService.clearOauthSessionCookie(response);
    }

    static void applyCallbackHeaders(final HttpServletResponse response) {
        response.setHeader("Cache-Control", CACHE_CONTROL_NO_STORE);
        response.setHeader("Referrer-Policy", REFERRER_POLICY_NO_REFERRER);
    }

    private static void requireSignInPurpose(final HttpSession session) {
        if (session == null) {
            throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
        }
        final Object purpose = session.getAttribute(OAuthSession.PURPOSE_ATTRIBUTE);
        if (!OAuthPurpose.SIGN_IN.name().equals(purpose)) {
            throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
        }
    }

    private static OidcUser requireOidcUser(final Authentication authentication) {
        if (authentication instanceof OAuth2AuthenticationToken token
                && token.getPrincipal() instanceof OidcUser oidcUser) {
            return oidcUser;
        }
        throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
    }

    private static String sessionReturnTo(final HttpSession session) {
        if (session == null) {
            return OAuthSession.DEFAULT_RETURN_TO;
        }
        final Object returnTo = session.getAttribute(OAuthSession.RETURN_TO_ATTRIBUTE);
        if (returnTo instanceof String value) {
            return value;
        }
        return OAuthSession.DEFAULT_RETURN_TO;
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

    private static boolean isBlank(final String value) {
        return value == null || value.isBlank();
    }
}
