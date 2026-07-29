package com.ricard0g.jobtrackr_api.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.model.StorageCleanupJob;
import com.ricard0g.jobtrackr_api.repository.StorageCleanupJobRepository;
import com.ricard0g.jobtrackr_api.storage.ObjectStorage;

@ExtendWith(MockitoExtension.class)
class StorageCleanupServiceTest {

    @Mock
    private StorageCleanupJobRepository repository;

    @Mock
    private ObjectStorage objectStorage;

    @Mock
    private CvGenerationProperties properties;

    @InjectMocks
    private StorageCleanupService service;

    @Test
    void processNext_abandonsAfterMaxAttempts() {
        when(properties.maxCleanupAttempts()).thenReturn(2);
        when(repository.claimNextJobId(any())).thenReturn(Optional.of(5L));
        final StorageCleanupJob job = StorageCleanupJob.create("users/x/obj.pdf");
        job.setAttempts(1);
        when(repository.findById(5L)).thenReturn(Optional.of(job));
        org.mockito.Mockito.doThrow(new RuntimeException("boom")).when(objectStorage).delete("users/x/obj.pdf");

        service.processNext();

        assert job.getCompletedAt() != null;
        assert "MAX_ATTEMPTS_EXCEEDED".equals(job.getLastError());
        verify(repository).save(job);
    }

    @Test
    void processNext_retriesBeforeMaxAttempts() {
        when(properties.maxCleanupAttempts()).thenReturn(5);
        when(repository.claimNextJobId(any())).thenReturn(Optional.of(5L));
        final StorageCleanupJob job = StorageCleanupJob.create("users/x/obj.pdf");
        when(repository.findById(5L)).thenReturn(Optional.of(job));
        org.mockito.Mockito.doThrow(new RuntimeException("boom")).when(objectStorage).delete("users/x/obj.pdf");

        service.processNext();

        assert job.getCompletedAt() == null;
        assert job.getNextAttemptAt().isAfter(OffsetDateTime.now().minusSeconds(1));
        verify(objectStorage).delete("users/x/obj.pdf");
        verify(repository).save(job);
        verify(repository, never()).delete(any());
    }

    @Test
    void processNext_retriesPreviewKeyDeleteFailures() {
        // given
        when(properties.maxCleanupAttempts()).thenReturn(5);
        when(repository.claimNextJobId(any())).thenReturn(Optional.of(9L));
        final String previewKey = "users/11111111-1111-4111-8111-111111111111/previews/base-cvs/7.pdf";
        final StorageCleanupJob job = StorageCleanupJob.create(previewKey);
        when(repository.findById(9L)).thenReturn(Optional.of(job));
        org.mockito.Mockito
                .doThrow(new RuntimeException("temporary r2 failure"))
                .when(objectStorage)
                .delete(previewKey);

        // when
        service.processNext();

        // then
        assert job.getCompletedAt() == null;
        assert "STORAGE_DELETE_FAILED".equals(job.getLastError());
        assert job.getNextAttemptAt().isAfter(OffsetDateTime.now().minusSeconds(1));
        verify(objectStorage).delete(previewKey);
        verify(repository).save(job);
        verify(repository, never()).delete(any());
    }
}
