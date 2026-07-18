package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.dto.CvGenerationDto.CvGenerationDtos;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.CvGeneration;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.repository.ApplicationCvRepository;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.BaseCvRepository;
import com.ricard0g.jobtrackr_api.repository.CvGenerationRepository;
import com.ricard0g.jobtrackr_api.repository.JobDescriptionRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class CvGenerationServiceTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");

    @Mock
    private UserRepository userRepository;

    @Mock
    private ApplicationRepository applicationRepository;

    @Mock
    private BaseCvRepository baseCvRepository;

    @Mock
    private JobDescriptionRepository jobDescriptionRepository;

    @Mock
    private CvGenerationRepository cvGenerationRepository;

    @Mock
    private ApplicationCvRepository applicationCvRepository;

    @Mock
    private CvGenerationProperties properties;

    @InjectMocks
    private CvGenerationService service;

    @Test
    void create_persistsPendingGenerationWithImmutableSnapshot() {
        when(properties.consentVersion()).thenReturn("v1");
        when(properties.maxAttempts()).thenReturn(3);
        when(properties.maxApplicationCvs()).thenReturn(20);
        when(properties.maxJobDescriptionChars()).thenReturn(50_000);
        when(properties.maxAdditionalInfoChars()).thenReturn(5_000);

        final User user = mock(User.class);
        when(user.getUserAiConsentVersion()).thenReturn("v1");
        when(user.getUserAiConsentAt()).thenReturn(java.time.OffsetDateTime.now());
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));

        final Application application = mock(Application.class);
        when(application.getApplicationId()).thenReturn(3L);
        when(applicationRepository.findForUser(3L, USER_ID)).thenReturn(Optional.of(application));

        final BaseCv baseCv = mock(BaseCv.class);
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(7L, USER_ID)).thenReturn(Optional.of(baseCv));
        when(applicationCvRepository.countByApplication_ApplicationId(3L)).thenReturn(0L);
        when(jobDescriptionRepository.findByApplication_ApplicationId(3L)).thenReturn(Optional.empty());
        when(cvGenerationRepository.findByUser_UserIdAndIdempotencyKey(USER_ID, "key-1"))
                .thenReturn(Optional.empty());
        when(cvGenerationRepository.saveAndFlush(any(CvGeneration.class))).thenAnswer(invocation -> {
            final CvGeneration generation = invocation.getArgument(0);
            generation.setCvGenerationId(99L);
            return generation;
        });

        final CvGenerationDtos.CreateRequest request = new CvGenerationDtos.CreateRequest(
                3L, 7L, GeneratedCvFormat.DOCX, "  Build APIs  ", "  Knows K8s  ", false);

        final CvGenerationDtos.Response response = service.create(USER_ID, "key-1", request);

        assertThat(response.status()).isEqualTo(CvGenerationStatus.PENDING);
        assertThat(response.cvGenerationId()).isEqualTo(99L);

        final ArgumentCaptor<CvGeneration> captor = ArgumentCaptor.forClass(CvGeneration.class);
        verify(cvGenerationRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getJobDescriptionSnapshot()).isEqualTo("Build APIs");
        assertThat(captor.getValue().getAdditionalInfoSnapshot()).isEqualTo("Knows K8s");
        assertThat(captor.getValue().getRequestedFormat()).isEqualTo(GeneratedCvFormat.DOCX);
    }

    @Test
    void create_whenIdempotencyReplayed_returnsExisting() {
        final CvGeneration existing = mock(CvGeneration.class);
        final Application application = mock(Application.class);
        when(application.getApplicationId()).thenReturn(3L);
        when(existing.getApplication()).thenReturn(application);
        when(existing.getCvGenerationId()).thenReturn(5L);
        when(existing.getRequestedFormat()).thenReturn(GeneratedCvFormat.PDF);
        when(existing.getStatus()).thenReturn(CvGenerationStatus.PROCESSING);
        when(existing.getIdempotencyKey()).thenReturn("same");
        when(existing.getCorrelationId()).thenReturn(UUID.randomUUID());
        when(cvGenerationRepository.findByUser_UserIdAndIdempotencyKey(USER_ID, "same"))
                .thenReturn(Optional.of(existing));

        final CvGenerationDtos.Response response = service.create(
                USER_ID,
                "same",
                new CvGenerationDtos.CreateRequest(3L, 7L, GeneratedCvFormat.PDF, "JD", null, true));

        assertThat(response.cvGenerationId()).isEqualTo(5L);
        verify(cvGenerationRepository, never()).saveAndFlush(any());
    }

    @Test
    void cancel_whenNotPending_rejects() {
        final CvGeneration generation = mock(CvGeneration.class);
        when(generation.getStatus()).thenReturn(CvGenerationStatus.PROCESSING);
        when(cvGenerationRepository.findByCvGenerationIdAndUser_UserId(9L, USER_ID))
                .thenReturn(Optional.of(generation));

        assertThatThrownBy(() -> service.cancel(USER_ID, 9L))
                .isInstanceOf(CvGenerationException.class)
                .extracting("code")
                .isEqualTo("INVALID_STATUS_TRANSITION");
    }
}
