package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.exception.GoogleSignInRejectedException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthResultCode;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class GoogleSignInService {

    private final UserIdentityRepository userIdentityRepository;

    @Transactional(readOnly = true)
    public User requireReturningGoogleUser(final String subject) {
        final UserIdentity identity = requireGoogleIdentity(subject);
        final User user = identity.getUser();
        final boolean unavailableUser = !user.isUserEnabled()
                || user.isUserLocked()
                || user.getUserDeletedAt() != null;
        if (unavailableUser) {
            throw new GoogleSignInRejectedException(OAuthResultCode.FAILED);
        }
        return user;
    }

    @Transactional
    public void recordSuccessfulGoogleUse(final String subject, final String verifiedEmail) {
        final UserIdentity identity = requireGoogleIdentity(subject);
        identity.recordSuccessfulUse(verifiedEmail, OffsetDateTime.now());
        userIdentityRepository.save(identity);
    }

    private UserIdentity requireGoogleIdentity(final String subject) {
        return userIdentityRepository
                .findByProviderAndSubject(IdentityProvider.GOOGLE, subject)
                .orElseThrow(() -> new GoogleSignInRejectedException(OAuthResultCode.FAILED));
    }
}
