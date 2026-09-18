package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

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

    public void linkGoogleIdentity(final UUID userId, final String subject, final String verifiedEmail) {
        final User user = userRepository.findById(userId)
                .orElseThrow(() -> new GoogleSignInRejectedException(OAuthResultCode.FAILED));
        requireAvailableUser(user);
        final String email = normalizeEmail(verifiedEmail);
        if (!user.getUserEmail().equalsIgnoreCase(email)) {
            throw new GoogleSignInRejectedException(OAuthResultCode.MISMATCH);
        }

        final Optional<UserIdentity> existingForUser =
                userIdentityRepository.findByUser_UserIdAndProvider(userId, IdentityProvider.GOOGLE);
        if (existingForUser.isPresent()) {
            refuseUnlessSameSubject(existingForUser.get(), subject, email);
            return;
        }

        final Optional<UserIdentity> existingSubject = findGoogleIdentity(subject);
        if (existingSubject.isPresent()) {
            refuseUnlessOwnedByUser(existingSubject.get(), userId, email);
            return;
        }

        try {
            transactionTemplate.execute(status -> {
                persistGoogleLink(user, subject, email);
                return null;
            });
        } catch (final DataIntegrityViolationException ignored) {
            recoverFromLinkRace(userId, subject, email);
        }
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
        return requireAvailableUser(identity.getUser());
    }

    private User requireAvailableUser(final User user) {
        final boolean unavailableUser = !user.isUserEnabled()
                || user.isUserLocked()
                || user.getUserDeletedAt() != null;
        if (unavailableUser) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
        return user;
    }

    private void refuseUnlessSameSubject(
            final UserIdentity existing,
            final String subject,
            final String email) {
        if (!existing.getSubject().equals(subject)) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
        recordSuccessfulUseAndVerify(existing, email);
    }

    private void refuseUnlessOwnedByUser(
            final UserIdentity existing,
            final UUID userId,
            final String email) {
        if (!existing.getUser().getUserId().equals(userId)) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
        recordSuccessfulUseAndVerify(existing, email);
    }

    private void persistGoogleLink(final User user, final String subject, final String email) {
        userIdentityRepository.saveAndFlush(UserIdentity.googleIdentity(
                user,
                subject,
                email,
                OffsetDateTime.now()));
        markPrimaryEmailVerified(user);
    }

    private void recoverFromLinkRace(final UUID userId, final String subject, final String email) {
        final UserIdentity identity = findGoogleIdentity(subject)
                .orElseThrow(() -> new GoogleSignInRejectedException(OAuthResultCode.FAILED));
        refuseUnlessOwnedByUser(identity, userId, email);
    }

    private void recordSuccessfulUseAndVerify(final UserIdentity identity, final String email) {
        identity.recordSuccessfulUse(email, OffsetDateTime.now());
        userIdentityRepository.save(identity);
        markPrimaryEmailVerified(identity.getUser());
    }

    private void markPrimaryEmailVerified(final User user) {
        if (user.isUserEmailVerified()) {
            return;
        }
        user.setUserEmailVerified(true);
        userRepository.save(user);
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
