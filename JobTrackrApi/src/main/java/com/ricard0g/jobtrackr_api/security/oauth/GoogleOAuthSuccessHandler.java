package com.ricard0g.jobtrackr_api.security.oauth;

import java.io.IOException;
import java.time.Instant;
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
import com.ricard0g.jobtrackr_api.service.PasswordCreationGrantService;
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
    private final PasswordCreationGrantService passwordCreationGrantService;

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
            final OAuthPurpose purpose = requirePurpose(session);
            final OidcUser oidcUser = requireOidcUser(authentication);
            final String subject = oidcUser.getSubject();
            final String email = oidcUser.getEmail();
            final boolean emailVerified = Boolean.TRUE.equals(oidcUser.getEmailVerified());
            final boolean missingIdentityClaims = isBlank(subject) || isBlank(email) || !emailVerified;
            if (missingIdentityClaims) {
                throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
            }

            if (purpose == OAuthPurpose.LINK_GOOGLE) {
                completeGoogleLink(request, response, session, subject, email, returnTo);
                return;
            }
            if (purpose == OAuthPurpose.CREATE_PASSWORD) {
                completeCreatePassword(request, response, session, oidcUser, subject, email);
                return;
            }

            final UUID currentUserId = currentSessionUserId(request);
            refuseUnknownGoogleSignInWhileAuthenticated(currentUserId, subject);
            final User signedInUser = googleSignInService.resolveGoogleSignIn(subject, email);
            refuseToReplaceDifferentUser(currentUserId, signedInUser);
            googleSignInService.recordSuccessfulGoogleUse(subject, email);

            final AuthTokenPair tokenPair = authService.issueSession(signedInUser);
            refreshTokenCookieService.writeRefreshTokenCookie(
                    response,
                    tokenPair.refreshToken(),
                    tokenPair.refreshExpiresAt());
            log.info(
                    "[GoogleSignIn] - COMPLETE: outcome: success, purpose: {}, userId: {}",
                    purpose,
                    signedInUser.getUserId());
            terminateOauthSession(request, response);
            response.sendRedirect(OAuthRedirects.successLocation(
                    googleAuthProperties.normalizedPublicOrigin(),
                    returnTo));
        } catch (GoogleSignInRejectedException exception) {
            redirectFailure(request, response, failurePath, exception.resultCode(), sessionPurpose(session));
        } catch (RuntimeException exception) {
            log.warn(
                    "[GoogleSignIn] - COMPLETE: outcome: failed, purpose: {}, errorMessage: {}",
                    sessionPurpose(session),
                    exception.getClass().getSimpleName());
            redirectFailure(request, response, failurePath, OAuthResultCode.FAILED, sessionPurpose(session));
        }
    }

    private void completeGoogleLink(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final HttpSession session,
            final String subject,
            final String email,
            final String returnTo) throws IOException {
        final UUID boundUserId = boundSessionUserId(session);
        final UUID refreshUserId = currentSessionUserId(request);
        final boolean refreshBelongsToBoundUser =
                refreshUserId != null && refreshUserId.equals(boundUserId);
        if (!refreshBelongsToBoundUser) {
            throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
        }

        googleSignInService.linkGoogleIdentity(boundUserId, subject, email);
        log.info(
                "[GoogleSignIn] - COMPLETE: outcome: success, purpose: {}, userId: {}",
                OAuthPurpose.LINK_GOOGLE,
                boundUserId);
        terminateOauthSession(request, response);
        response.sendRedirect(OAuthRedirects.successLocation(
                googleAuthProperties.normalizedPublicOrigin(),
                returnTo));
    }

    private void completeCreatePassword(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final HttpSession session,
            final OidcUser oidcUser,
            final String subject,
            final String email) throws IOException {
        final UUID boundUserId = boundSessionUserId(session);
        final UUID refreshUserId = currentSessionUserId(request);
        final boolean refreshBelongsToBoundUser =
                refreshUserId != null && refreshUserId.equals(boundUserId);
        if (!refreshBelongsToBoundUser) {
            throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
        }

        final boolean matchingSubject = googleSignInService.findLinkedUser(subject)
                .filter(user -> boundUserId.equals(user.getUserId()))
                .isPresent();
        if (!matchingSubject) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
        if (!isFreshAuthentication(oidcUser)) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }

        googleSignInService.recordSuccessfulGoogleUse(subject, email);
        passwordCreationGrantService.issue(request, response, boundUserId);
        log.info(
                "[GoogleSignIn] - COMPLETE: outcome: success, purpose: {}, userId: {}",
                OAuthPurpose.CREATE_PASSWORD,
                boundUserId);
        response.sendRedirect(OAuthRedirects.createPasswordGrantLocation(
                googleAuthProperties.normalizedPublicOrigin()));
    }

    private static boolean isFreshAuthentication(final OidcUser oidcUser) {
        final Instant authenticatedAt = oidcUser.getAuthenticatedAt();
        if (authenticatedAt == null) {
            return false;
        }
        return !authenticatedAt.isBefore(Instant.now().minusSeconds(OAuthSession.TIMEOUT_SECONDS));
    }

    private void refuseUnknownGoogleSignInWhileAuthenticated(final UUID currentUserId, final String subject) {
        final boolean unknownGoogleWhileAuthenticated =
                currentUserId != null && googleSignInService.findLinkedUser(subject).isEmpty();
        if (unknownGoogleWhileAuthenticated) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
    }

    private void refuseToReplaceDifferentUser(final UUID currentUserId, final User signedInUser) {
        if (currentUserId == null) {
            return;
        }
        final boolean replacingDifferentUser = !currentUserId.equals(signedInUser.getUserId());
        if (replacingDifferentUser) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
    }

    private UUID currentSessionUserId(final HttpServletRequest request) {
        return refreshTokenService
                .findActiveUser(refreshTokenCookieService.readRefreshTokenCookie(request))
                .map(User::getUserId)
                .orElse(null);
    }

    private void redirectFailure(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final String failurePath,
            final OAuthResultCode resultCode,
            final OAuthPurpose purpose) throws IOException {
        log.info(
                "[GoogleSignIn] - COMPLETE: outcome: {}, purpose: {}",
                resultCode.queryValue(),
                purpose);
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

    private static OAuthPurpose requirePurpose(final HttpSession session) {
        if (session == null) {
            throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
        }
        final Object purpose = session.getAttribute(OAuthSession.PURPOSE_ATTRIBUTE);
        if (OAuthPurpose.LINK_GOOGLE.name().equals(purpose)) {
            return OAuthPurpose.LINK_GOOGLE;
        }
        if (OAuthPurpose.CREATE_PASSWORD.name().equals(purpose)) {
            return OAuthPurpose.CREATE_PASSWORD;
        }
        if (OAuthPurpose.SIGN_IN.name().equals(purpose)) {
            return OAuthPurpose.SIGN_IN;
        }
        throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
    }

    private static OAuthPurpose sessionPurpose(final HttpSession session) {
        if (session == null) {
            return OAuthPurpose.SIGN_IN;
        }
        final Object purpose = session.getAttribute(OAuthSession.PURPOSE_ATTRIBUTE);
        if (OAuthPurpose.LINK_GOOGLE.name().equals(purpose)) {
            return OAuthPurpose.LINK_GOOGLE;
        }
        if (OAuthPurpose.CREATE_PASSWORD.name().equals(purpose)) {
            return OAuthPurpose.CREATE_PASSWORD;
        }
        return OAuthPurpose.SIGN_IN;
    }

    private static UUID boundSessionUserId(final HttpSession session) {
        if (session == null) {
            throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
        }
        final Object boundUserId = session.getAttribute(OAuthSession.USER_ID_ATTRIBUTE);
        if (boundUserId instanceof String value) {
            try {
                return UUID.fromString(value);
            } catch (final IllegalArgumentException ignored) {
                throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
            }
        }
        throw new GoogleSignInRejectedException(OAuthResultCode.EXPIRED);
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
