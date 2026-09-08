package com.ricard0g.jobtrackr_api.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.config.security.OauthSessionCookieService;
import com.ricard0g.jobtrackr_api.exception.GooglePasswordReauthNotAllowedException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthPurpose;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthSession;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class GooglePasswordReauthIntentService {

    private final UserRepository userRepository;
    private final UserIdentityRepository userIdentityRepository;
    private final OauthSessionCookieService oauthSessionCookieService;

    @Transactional(readOnly = true)
    public void beginReauth(
            final UUID userId,
            final HttpServletRequest request,
            final HttpServletResponse response) {
        final User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));
        final boolean alreadyHasPassword = user.hasPasswordSignIn();
        final boolean missingGoogleIdentity = userIdentityRepository
                .findByUser_UserIdAndProvider(userId, IdentityProvider.GOOGLE)
                .isEmpty();
        final boolean cannotCreatePassword = alreadyHasPassword || missingGoogleIdentity;
        if (cannotCreatePassword) {
            throw new GooglePasswordReauthNotAllowedException();
        }

        replaceOauthSession(userId, request, response);
    }

    private void replaceOauthSession(
            final UUID userId,
            final HttpServletRequest request,
            final HttpServletResponse response) {
        final HttpSession existingSession = request.getSession(false);
        if (existingSession != null) {
            existingSession.invalidate();
            oauthSessionCookieService.clearOauthSessionCookie(response);
        }

        final HttpSession session = request.getSession(true);
        session.setMaxInactiveInterval(OAuthSession.TIMEOUT_SECONDS);
        session.setAttribute(OAuthSession.PURPOSE_ATTRIBUTE, OAuthPurpose.CREATE_PASSWORD.name());
        session.setAttribute(OAuthSession.USER_ID_ATTRIBUTE, userId.toString());
        session.setAttribute(OAuthSession.RETURN_TO_ATTRIBUTE, OAuthSession.ACCOUNT_SETTINGS_PATH);
        session.setAttribute(OAuthSession.FAILURE_PATH_ATTRIBUTE, OAuthSession.ACCOUNT_SETTINGS_PATH);
    }
}
