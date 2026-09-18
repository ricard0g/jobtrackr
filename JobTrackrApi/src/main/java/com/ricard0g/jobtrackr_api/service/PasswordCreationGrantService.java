package com.ricard0g.jobtrackr_api.service;

import java.time.Instant;
import java.util.UUID;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.ricard0g.jobtrackr_api.config.security.OauthSessionCookieService;
import com.ricard0g.jobtrackr_api.exception.PasswordCreationGrantRequiredException;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthPurpose;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthSession;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class PasswordCreationGrantService {

    private final OauthSessionCookieService oauthSessionCookieService;

    public void issue(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final UUID userId) {
        final HttpSession handshake = request.getSession(false);
        if (handshake != null) {
            handshake.invalidate();
        }
        oauthSessionCookieService.clearOauthSessionCookie(response);

        final HttpSession grant = request.getSession(true);
        grant.setMaxInactiveInterval(OAuthSession.TIMEOUT_SECONDS);
        grant.setAttribute(OAuthSession.PURPOSE_ATTRIBUTE, OAuthPurpose.CREATE_PASSWORD.name());
        grant.setAttribute(OAuthSession.USER_ID_ATTRIBUTE, userId.toString());
        grant.setAttribute(OAuthSession.ISSUED_AT_ATTRIBUTE, Instant.now().toString());
        grant.setAttribute(OAuthSession.CONSUMED_ATTRIBUTE, Boolean.FALSE);
        SecurityContextHolder.clearContext();
    }

    public void consume(final HttpServletRequest request, final UUID userId) {
        final HttpSession session = request.getSession(false);
        if (session == null) {
            throw new PasswordCreationGrantRequiredException();
        }
        try {
            synchronized (session) {
                if (!isUnconsumedGrantForUser(session, userId)) {
                    throw new PasswordCreationGrantRequiredException();
                }
                session.setAttribute(OAuthSession.CONSUMED_ATTRIBUTE, Boolean.TRUE);
            }
        } catch (final IllegalStateException ignored) {
            throw new PasswordCreationGrantRequiredException();
        }
    }

    public void discard(final HttpServletRequest request, final HttpServletResponse response) {
        final HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        oauthSessionCookieService.clearOauthSessionCookie(response);
    }

    private static boolean isUnconsumedGrantForUser(final HttpSession session, final UUID userId) {
        final boolean matchingPurpose =
                OAuthPurpose.CREATE_PASSWORD.name().equals(session.getAttribute(OAuthSession.PURPOSE_ATTRIBUTE));
        final boolean matchingUser = userId.toString().equals(session.getAttribute(OAuthSession.USER_ID_ATTRIBUTE));
        final boolean unconsumed = Boolean.FALSE.equals(session.getAttribute(OAuthSession.CONSUMED_ATTRIBUTE));
        return matchingPurpose && matchingUser && unconsumed && issuedWithinTimeout(session);
    }

    private static boolean issuedWithinTimeout(final HttpSession session) {
        final Object issuedAtValue = session.getAttribute(OAuthSession.ISSUED_AT_ATTRIBUTE);
        if (!(issuedAtValue instanceof String issuedAtText)) {
            return false;
        }
        try {
            final Instant issuedAt = Instant.parse(issuedAtText);
            return !issuedAt.isBefore(Instant.now().minusSeconds(OAuthSession.TIMEOUT_SECONDS));
        } catch (final RuntimeException ignored) {
            return false;
        }
    }
}
