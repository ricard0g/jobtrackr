package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.model.StorageCleanupJob;
import com.ricard0g.jobtrackr_api.repository.StorageCleanupJobRepository;
import com.ricard0g.jobtrackr_api.storage.ObjectStorage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class StorageCleanupService {

    private final StorageCleanupJobRepository repository;
    private final ObjectStorage objectStorage;
    private final CvGenerationProperties properties;

    @Transactional
    public void processNext() {
        final Long jobId = repository.claimNextJobId(OffsetDateTime.now()).orElse(null);
        if (jobId == null) {
            return;
        }
        final StorageCleanupJob job = repository.findById(jobId).orElse(null);
        if (job == null || job.getCompletedAt() != null) {
            return;
        }
        job.setAttempts(job.getAttempts() + 1);
        try {
            objectStorage.delete(job.getObjectKey());
            job.setCompletedAt(OffsetDateTime.now());
            job.setLastError(null);
            repository.save(job);
            log.info("[StorageCleanup] - DELETED: jobId: {}, attempts: {}", jobId, job.getAttempts());
        } catch (final RuntimeException exception) {
            if (job.getAttempts() >= properties.maxCleanupAttempts()) {
                job.setCompletedAt(OffsetDateTime.now());
                job.setLastError("MAX_ATTEMPTS_EXCEEDED");
                repository.save(job);
                log.error(
                        "[StorageCleanup] - ABANDONED: jobId: {}, attempts: {}",
                        jobId,
                        job.getAttempts());
                return;
            }
            final long backoffSeconds = Math.min(3600L, (long) Math.pow(2, Math.max(0, job.getAttempts() - 1)) * 30L);
            job.setNextAttemptAt(OffsetDateTime.now().plusSeconds(backoffSeconds));
            job.setLastError("STORAGE_DELETE_FAILED");
            repository.save(job);
            log.warn("[StorageCleanup] - RETRY: jobId: {}, attempts: {}", jobId, job.getAttempts());
        }
    }
}
