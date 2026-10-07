package com.ricard0g.jobtrackr_api.registration;

import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.config.security.GoogleAuthProperties;
import com.ricard0g.jobtrackr_api.config.security.OauthSessionCookieService;
import com.ricard0g.jobtrackr_api.exception.GoogleSignInRejectedException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthPurpose;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthResultCode;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthSession;
import com.ricard0g.jobtrackr_api.service.AuthService;
import com.ricard0g.jobtrackr_api.service.AuthService.AuthTokenPair;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class GoogleRegistrationService {
    private final RegistrationRepository repository;
    private final UserRepository userRepository;
    private final UserIdentityRepository userIdentityRepository;
    private final AuthService authService;
    private final GoogleAuthProperties googleAuthProperties;
    private final OauthSessionCookieService oauthSessionCookieService;

    @Transactional
    public void begin(final String checkoutToken, final String verificationToken,
                      final HttpServletRequest request, final HttpServletResponse response) {
        googleAuthProperties.requireEnabled();
        final RegistrationRepository.Claim claim = lockByEitherToken(checkoutToken, verificationToken);
        final HttpSession existing = request.getSession(false);
        if (existing != null) {
            existing.invalidate();
            oauthSessionCookieService.clearOauthSessionCookie(response);
        }
        final HttpSession session = request.getSession(true);
        session.setMaxInactiveInterval(OAuthSession.TIMEOUT_SECONDS);
        session.setAttribute(OAuthSession.PURPOSE_ATTRIBUTE, OAuthPurpose.REGISTER_GOOGLE.name());
        session.setAttribute(OAuthSession.CLAIM_ID_ATTRIBUTE, claim.id().toString());
        session.setAttribute(OAuthSession.RETURN_TO_ATTRIBUTE, OAuthSession.DEFAULT_RETURN_TO);
        session.setAttribute(OAuthSession.FAILURE_PATH_ATTRIBUTE, OAuthSession.REGISTER_FAILURE_PATH);
    }

    @Transactional
    public AuthTokenPair complete(final UUID claimId, final String subject, final String verifiedEmail) {
        final RegistrationRepository.Claim claim;
        try {
            claim = repository.lockById(claimId);
        } catch (final RegistrationException exception) {
            throw unusableClaim(claimId);
        }
        final String email = verifiedEmail.trim().toLowerCase(Locale.ROOT);
        if (!claim.email().equals(email)) {
            throw new GoogleSignInRejectedException(OAuthResultCode.MISMATCH);
        }
        final boolean collision = userIdentityRepository
                .findByProviderAndSubject(IdentityProvider.GOOGLE, subject).isPresent()
                || userRepository.existsByUserEmail(email);
        if (collision) {
            throw new GoogleSignInRejectedException(OAuthResultCode.CONFLICT);
        }
        try {
            final User user = userRepository.saveAndFlush(User.googleJustInTime(email));
            userIdentityRepository.saveAndFlush(
                    UserIdentity.googleIdentity(user, subject, email, OffsetDateTime.now()));
            repository.consumeAndLink(claim, user.getUserId());
            return authService.issueSession(user);
        } catch (final DataIntegrityViolationException exception) {
            throw new GoogleSignInRejectedException(OAuthResultCode.CONFLICT);
        } catch (final RegistrationException exception) {
            throw unusableClaim(claimId);
        }
    }

    private GoogleSignInRejectedException unusableClaim(final UUID claimId) {
        if (repository.isConsumed(claimId)) {
            return new GoogleSignInRejectedException(OAuthResultCode.REGISTRATION_USED);
        }
        return new GoogleSignInRejectedException(OAuthResultCode.REGISTRATION_EXPIRED);
    }

    private RegistrationRepository.Claim lockByEitherToken(final String checkoutToken,
                                                           final String verificationToken) {
        final boolean hasCheckoutToken = checkoutToken != null && !checkoutToken.isBlank();
        final boolean hasVerificationToken = verificationToken != null && !verificationToken.isBlank();
        if (hasCheckoutToken == hasVerificationToken) {
            throw RegistrationException.invalidClaim();
        }
        if (hasCheckoutToken) {
            return repository.lockByCheckoutToken(checkoutToken);
        }
        return repository.lockByVerificationToken(RegistrationService.hash(verificationToken));
    }
}
