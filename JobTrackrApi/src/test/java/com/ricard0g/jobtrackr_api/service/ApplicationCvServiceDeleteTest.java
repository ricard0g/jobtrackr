package com.ricard0g.jobtrackr_api.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
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

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.model.ApplicationCv;
import com.ricard0g.jobtrackr_api.model.StorageCleanupJob;
import com.ricard0g.jobtrackr_api.repository.ApplicationCvRepository;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.StorageCleanupJobRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.storage.ObjectStorage;

@ExtendWith(MockitoExtension.class)
class ApplicationCvServiceDeleteTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final Long GENERATED_CV_ID = 42L;
    private static final String CANONICAL_KEY = "users/" + USER_ID + "/generated-cvs/opaque.docx";
    private static final String PREVIEW_KEY =
            "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";

    @Mock
    private UserRepository userRepository;

    @Mock
    private ApplicationRepository applicationRepository;

    @Mock
    private ApplicationCvRepository applicationCvRepository;

    @Mock
    private StorageCleanupJobRepository storageCleanupJobRepository;

    @Mock
    private ObjectStorage objectStorage;

    @Mock
    private CvGenerationProperties properties;

    @InjectMocks
    private ApplicationCvService service;

    @Test
    void delete_schedulesCanonicalObjectAndDeterministicPreviewKeyForCleanup() {
        // given
        final ApplicationCv applicationCv = mock(ApplicationCv.class);
        when(applicationCv.getObjectKey()).thenReturn(CANONICAL_KEY);
        when(applicationCv.getApplicationCvId()).thenReturn(GENERATED_CV_ID);
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(applicationCv));
        when(storageCleanupJobRepository.findByObjectKeyAndCompletedAtIsNull(any())).thenReturn(List.of());

        // when
        service.delete(USER_ID, GENERATED_CV_ID);

        // then
        verify(applicationCvRepository).delete(applicationCv);
        verify(applicationCvRepository).flush();
        verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) -> CANONICAL_KEY.equals(job.getObjectKey())));
        verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) -> PREVIEW_KEY.equals(job.getObjectKey())));
    }

    @Test
    void scheduleCleanupForApplication_schedulesCanonicalAndPreviewKeysForEachGeneratedCv() {
        // given
        final ApplicationCv first = mock(ApplicationCv.class);
        when(first.getObjectKey()).thenReturn(CANONICAL_KEY);
        when(first.getApplicationCvId()).thenReturn(GENERATED_CV_ID);
        final ApplicationCv second = mock(ApplicationCv.class);
        when(second.getObjectKey()).thenReturn("users/" + USER_ID + "/generated-cvs/other.pdf");
        when(second.getApplicationCvId()).thenReturn(43L);
        when(applicationCvRepository.findAllByApplication_ApplicationId(9L)).thenReturn(List.of(first, second));
        when(storageCleanupJobRepository.findByObjectKeyAndCompletedAtIsNull(any())).thenReturn(List.of());

        // when
        service.scheduleCleanupForApplication(USER_ID, 9L);

        // then
        verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) -> CANONICAL_KEY.equals(job.getObjectKey())));
        verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) -> PREVIEW_KEY.equals(job.getObjectKey())));
        verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) ->
                        ("users/" + USER_ID + "/generated-cvs/other.pdf").equals(job.getObjectKey())));
        verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) ->
                        ("users/" + USER_ID + "/previews/generated-cvs/43.pdf")
                                .equals(job.getObjectKey())));
    }
}
