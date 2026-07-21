package com.ricard0g.jobtrackr_api.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.CvGeneration;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.CvGenerationRepository;

@ExtendWith(MockitoExtension.class)
class ApplicationServiceDeleteCvGenerationTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");

    @Mock
    private ApplicationRepository applicationRepository;

    @Mock
    private ApplicationCvService applicationCvService;

    @Mock
    private CvGenerationRepository cvGenerationRepository;

    @Mock
    private com.ricard0g.jobtrackr_api.repository.UserRepository userRepository;

    @Mock
    private com.ricard0g.jobtrackr_api.repository.CompanyRepository companyRepository;

    @Mock
    private com.ricard0g.jobtrackr_api.repository.TagRepository tagRepository;

    @Mock
    private StatusHistoryService statusHistoryService;

    @InjectMocks
    private ApplicationService applicationService;

    @Test
    void deleteApplication_cancelsOnlyPendingAndSchedulesCleanupUnderLock() {
        final Application application = mock(Application.class);
        when(applicationRepository.findForUserWithLock(3L, USER_ID)).thenReturn(Optional.of(application));

        final CvGeneration pending = mock(CvGeneration.class);
        when(cvGenerationRepository.findAllByApplication_ApplicationIdAndStatusIn(
                        3L, List.of(CvGenerationStatus.PENDING)))
                .thenReturn(List.of(pending));

        applicationService.deleteApplication(USER_ID, 3L);

        verify(applicationCvService).scheduleCleanupForApplication(3L);
        verify(pending).setStatus(CvGenerationStatus.CANCELLED);
        verify(cvGenerationRepository, never())
                .findAllByApplication_ApplicationIdAndStatusIn(
                        eq(3L), eq(List.of(CvGenerationStatus.PENDING, CvGenerationStatus.PROCESSING)));
        verify(applicationRepository).delete(application);
    }
}
