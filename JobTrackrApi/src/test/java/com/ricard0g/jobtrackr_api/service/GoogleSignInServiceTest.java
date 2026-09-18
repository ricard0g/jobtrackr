package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionTemplate;

import com.ricard0g.jobtrackr_api.exception.GoogleSignInRejectedException;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthResultCode;

@ExtendWith(MockitoExtension.class)
class GoogleSignInServiceTest {

    private static final String SUBJECT = "race-subject";
    private static final String EMAIL = "race@example.com";

    @Mock
    private UserIdentityRepository userIdentityRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TransactionTemplate transactionTemplate;

    private GoogleSignInService googleSignInService;
    private User winner;
    private UserIdentity winnerIdentity;

    @BeforeEach
    void setUp() {
        googleSignInService = new GoogleSignInService(
                userIdentityRepository,
                userRepository,
                transactionTemplate);
        winner = User.googleJustInTime(EMAIL);
        winner.setUserId(UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
        winnerIdentity = UserIdentity.googleIdentity(winner, SUBJECT, EMAIL, OffsetDateTime.parse("2026-09-18T12:00:00Z"));
    }

    @Test
    void resolveGoogleSignIn_reusesConcurrentWinnerWhenEmailAppearsBeforeIdentityLookup() {
        // given
        when(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, SUBJECT))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(winnerIdentity));
        when(userRepository.existsByUserEmail(EMAIL)).thenReturn(true);

        // when
        final User signedIn = googleSignInService.resolveGoogleSignIn(SUBJECT, EMAIL);

        // then
        assertThat(signedIn).isSameAs(winner);
        verify(transactionTemplate, never()).execute(any());
    }

    @Test
    void resolveGoogleSignIn_rejectsEmailCollisionWithoutTheGoogleSubject() {
        // given
        when(userIdentityRepository.findByProviderAndSubject(IdentityProvider.GOOGLE, SUBJECT))
                .thenReturn(Optional.empty());
        when(userRepository.existsByUserEmail(EMAIL)).thenReturn(true);

        // when / then
        assertThatThrownBy(() -> googleSignInService.resolveGoogleSignIn(SUBJECT, EMAIL))
                .isInstanceOf(GoogleSignInRejectedException.class)
                .extracting(exception -> ((GoogleSignInRejectedException) exception).resultCode())
                .isEqualTo(OAuthResultCode.CONFLICT);
        verify(transactionTemplate, never()).execute(any());
    }
}
