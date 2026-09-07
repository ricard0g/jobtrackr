package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.ricard0g.jobtrackr_api.exception.GoogleSignInRejectedException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthResultCode;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class GoogleSignInService {

    private final UserIdentityRepository userIdentityRepository;
    private final UserRepository userRepository;
    private final TransactionTemplate transactionTemplate;

    public User resolveGoogleSignIn(final String subject, final String verifiedEmail) {
        return findGoogleIdentity(subject)
                .map(this::requireAvailableUser)
                .orElseGet(() -> createGoogleUserIfEmailUnused(subject, normalizeEmail(verifiedEmail)));
    }

    @Transactional(readOnly = true)
    public Optional<User> findLinkedUser(final String subject) {
        return findGoogleIdentity(subject).map(UserIdentity::getUser);
    }

    @Transactional
    public void recordSuccessfulGoogleUse(final String subject, final String verifiedEmail) {
        final UserIdentity identity = requireGoogleIdentity(subject);
        identity.recordSuccessfulUse(verifiedEmail, OffsetDateTime.now());
        userIdentityRepository.save(identity);
    }

    private User createGoogleUserIfEmailUnused(final String subject, final String verifiedEmail) {
        if (userRepository.existsByUserEmail(verifiedEmail)) {
            throw new GoogleSignInRejectedException(OAuthResultCode.CONFLICT);
        }
        try {
            return transactionTemplate.execute(status -> createGoogleUser(subject, verifiedEmail));
        } catch (final DataIntegrityViolationException ignored) {
            return recoverFromCreationRace(subject, verifiedEmail);
        }
    }

    private User createGoogleUser(final String subject, final String verifiedEmail) {
        final OffsetDateTime now = OffsetDateTime.now();
        final User savedUser = userRepository.saveAndFlush(User.googleJustInTime(verifiedEmail));
        userIdentityRepository.saveAndFlush(UserIdentity.googleIdentity(savedUser, subject, verifiedEmail, now));
        return savedUser;
    }

    private User recoverFromCreationRace(final String subject, final String verifiedEmail) {
        return findGoogleIdentity(subject)
                .map(this::requireAvailableUser)
                .orElseThrow(() -> {
                    if (userRepository.existsByUserEmail(verifiedEmail)) {
                        return new GoogleSignInRejectedException(OAuthResultCode.CONFLICT);
                    }
                    return new GoogleSignInRejectedException(OAuthResultCode.FAILED);
                });
    }

    private User requireAvailableUser(final UserIdentity identity) {
        final User user = identity.getUser();
        final boolean unavailableUser = !user.isUserEnabled()
                || user.isUserLocked()
                || user.getUserDeletedAt() != null;
        if (unavailableUser) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
        return user;
    }

    private UserIdentity requireGoogleIdentity(final String subject) {
        return findGoogleIdentity(subject)
                .orElseThrow(() -> new GoogleSignInRejectedException(OAuthResultCode.FAILED));
    }

    private Optional<UserIdentity> findGoogleIdentity(final String subject) {
        return userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, subject);
    }

    private String normalizeEmail(final String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
