package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.ricard0g.jobtrackr_api.client.CvGenerationServiceClient;
import com.ricard0g.jobtrackr_api.client.CvGenerationServiceClient.GenerationResult;
import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.ApplicationCv;
import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.CvGeneration;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.repository.ApplicationCvRepository;
import com.ricard0g.jobtrackr_api.repository.CvGenerationRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.storage.ObjectStorage;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class CvGenerationWorkerService {

    private final CvGenerationRepository cvGenerationRepository;
    private final ApplicationCvRepository applicationCvRepository;
    private final UserRepository userRepository;
    private final ObjectStorage objectStorage;
    private final CvGenerationServiceClient client;
    private final ApplicationCvService applicationCvService;
    private final CvGenerationProperties properties;
    private final EntityManager entityManager;
    private final TransactionTemplate transactionTemplate;

    private final String workerId = "worker-" + UUID.randomUUID();

    @Transactional
    public Long claimNext() {
        return cvGenerationRepository.claimNextGenerationId(OffsetDateTime.now()).orElse(null);
    }

    @Transactional
    public void markProcessing(final Long generationId) {
        final CvGeneration generation = cvGenerationRepository.findById(generationId).orElse(null);
        if (generation == null) {
            return;
        }
        if (generation.getStatus().isTerminal()) {
            return;
        }
        generation.setStatus(CvGenerationStatus.PROCESSING);
        generation.setLeaseOwner(workerId);
        generation.setLeaseExpiresAt(OffsetDateTime.now().plus(properties.leaseDuration()));
        if (generation.getStartedAt() == null) {
            generation.setStartedAt(OffsetDateTime.now());
        }
        generation.setAttemptCount(generation.getAttemptCount() + 1);
        cvGenerationRepository.save(generation);
        log.info(
                "[CvGenerationWorker] - CLAIM: cvGenerationId: {}, attempt: {}, correlationId: {}",
                generationId,
                generation.getAttemptCount(),
                generation.getCorrelationId());
    }

    public void processClaimed(final Long generationId) {
        final WorkItem workItem = transactionTemplate.execute(status -> loadWorkItem(generationId));
        if (workItem == null) {
            return;
        }
        if (workItem.baseCvObjectKey() == null) {
            failTerminal(generationId, "BASE_CV_UNAVAILABLE", "Base CV is no longer available");
            return;
        }

        final byte[] baseCvBytes;
        try {
            baseCvBytes = objectStorage.download(workItem.baseCvObjectKey());
        } catch (final RuntimeException exception) {
            retryOrFail(generationId, "STORAGE_UNAVAILABLE", "Unable to download Base CV", true);
            return;
        }

        final GenerationResult result = client.generate(
                baseCvBytes,
                workItem.originalFilename(),
                workItem.contentType(),
                workItem.format(),
                workItem.jobDescription(),
                workItem.additionalInfo(),
                workItem.correlationId());

        if (result.success()) {
            try {
                finalizeSuccess(generationId, result);
            } catch (final RetrySignal signal) {
                retryOrFail(generationId, signal.errorCode(), signal.errorMessage(), signal.retryable());
            }
            return;
        }
        retryOrFail(generationId, result.errorCode(), safeMessage(result.errorMessage()), result.retryable());
    }

    private WorkItem loadWorkItem(final Long generationId) {
        final CvGeneration generation = cvGenerationRepository.findById(generationId).orElse(null);
        if (generation == null || generation.getStatus() != CvGenerationStatus.PROCESSING) {
            return null;
        }
        final BaseCv baseCv = generation.getBaseCv();
        if (baseCv == null) {
            return new WorkItem(
                    null,
                    null,
                    null,
                    generation.getRequestedFormat(),
                    generation.getJobDescriptionSnapshot(),
                    generation.getAdditionalInfoSnapshot(),
                    generation.getCorrelationId());
        }
        return new WorkItem(
                baseCv.getObjectKey(),
                baseCv.getOriginalFilename(),
                baseCv.getContentType(),
                generation.getRequestedFormat(),
                generation.getJobDescriptionSnapshot(),
                generation.getAdditionalInfoSnapshot(),
                generation.getCorrelationId());
    }

    public void finalizeSuccess(final Long generationId, final GenerationResult result) {
        final String[] uploadedObjectKey = {null};
        try {
            transactionTemplate.executeWithoutResult(status -> {
                final CvGeneration generation = cvGenerationRepository.findById(generationId).orElse(null);
                if (generation == null || generation.getStatus() != CvGenerationStatus.PROCESSING) {
                    return;
                }

                final Application application = generation.getApplication();
                userRepository.findByIdForUpdate(application.getUser().getUserId()).orElseThrow();
                entityManager
                        .createNativeQuery(
                                "SELECT application_id FROM applications WHERE application_id = :id FOR UPDATE")
                        .setParameter("id", application.getApplicationId())
                        .getSingleResult();

                if (applicationCvRepository.countByApplication_ApplicationId(application.getApplicationId())
                        >= properties.maxApplicationCvs()) {
                    markFailed(generation, "GENERATION_LIMIT_REACHED", "Application CV limit reached");
                    return;
                }

                final int nextVersion = applicationCvRepository.findMaxVersion(application.getApplicationId()) + 1;
                final String objectKey = "users/"
                        + application.getUser().getUserId()
                        + "/applications/"
                        + application.getApplicationId()
                        + "/cvs/"
                        + UUID.randomUUID()
                        + "."
                        + generation.getRequestedFormat().extension();
                final String filename = "application-"
                        + application.getApplicationId()
                        + "-cv-v"
                        + nextVersion
                        + "."
                        + generation.getRequestedFormat().extension();

                try {
                    objectStorage.upload(objectKey, result.bytes(), result.contentType());
                    uploadedObjectKey[0] = objectKey;
                } catch (final RuntimeException exception) {
                    throw new RetrySignal("STORAGE_UNAVAILABLE", "Unable to store generated CV", true);
                }

                try {
                    final ApplicationCv applicationCv = ApplicationCv.create(
                            application,
                            nextVersion,
                            objectKey,
                            filename,
                            generation.getRequestedFormat(),
                            result.contentType(),
                            result.byteSize(),
                            result.sha256(),
                            generation);
                    final ApplicationCv savedCv = applicationCvRepository.saveAndFlush(applicationCv);
                    generation.setApplicationCv(savedCv);
                    generation.setStatus(CvGenerationStatus.COMPLETED);
                    generation.setModelId(result.modelId());
                    generation.setWorkflowVersion(result.workflowVersion());
                    generation.setErrorCode(null);
                    generation.setErrorMessage(null);
                    generation.setLeaseOwner(null);
                    generation.setLeaseExpiresAt(null);
                    generation.setCompletedAt(OffsetDateTime.now());
                    cvGenerationRepository.save(generation);
                    log.info(
                            "[CvGenerationWorker] - COMPLETED: cvGenerationId: {}, applicationCvId: {}, version: {}, correlationId: {}",
                            generationId,
                            savedCv.getApplicationCvId(),
                            nextVersion,
                            generation.getCorrelationId());
                } catch (final RuntimeException exception) {
                    status.setRollbackOnly();
                    throw new RetrySignal("STORAGE_UNAVAILABLE", "Unable to finalize generated CV", true);
                }
            });
        } catch (final RetrySignal signal) {
            if (uploadedObjectKey[0] != null) {
                applicationCvService.scheduleCleanup(uploadedObjectKey[0]);
            }
            throw signal;
        }
    }

    public void retryOrFail(
            final Long generationId, final String errorCode, final String errorMessage, final boolean retryable) {
        try {
            transactionTemplate.executeWithoutResult(status -> {
                final CvGeneration generation = cvGenerationRepository.findById(generationId).orElse(null);
                if (generation == null || generation.getStatus() != CvGenerationStatus.PROCESSING) {
                    return;
                }
                final boolean canRetry = retryable && generation.getAttemptCount() < generation.getMaxAttempts();
                if (canRetry) {
                    final long backoffSeconds =
                            (long) Math.pow(2, Math.max(0, generation.getAttemptCount() - 1)) * 5L;
                    generation.setStatus(CvGenerationStatus.PENDING);
                    generation.setNextAttemptAt(OffsetDateTime.now().plusSeconds(backoffSeconds));
                    generation.setLeaseOwner(null);
                    generation.setLeaseExpiresAt(null);
                    generation.setErrorCode(errorCode);
                    generation.setErrorMessage(truncate(errorMessage));
                    cvGenerationRepository.save(generation);
                    log.warn(
                            "[CvGenerationWorker] - RETRY: cvGenerationId: {}, attempt: {}, errorCode: {}, correlationId: {}",
                            generationId,
                            generation.getAttemptCount(),
                            errorCode,
                            generation.getCorrelationId());
                    return;
                }
                markFailed(generation, errorCode, errorMessage);
            });
        } catch (final RetrySignal signal) {
            retryOrFail(generationId, signal.errorCode(), signal.errorMessage(), signal.retryable());
        }
    }

    public void failTerminal(final Long generationId, final String errorCode, final String errorMessage) {
        transactionTemplate.executeWithoutResult(status -> {
            final CvGeneration generation = cvGenerationRepository.findById(generationId).orElse(null);
            if (generation == null || generation.getStatus().isTerminal()) {
                return;
            }
            markFailed(generation, errorCode, errorMessage);
        });
    }

    @Transactional
    public int purgeExpiredTerminal() {
        final OffsetDateTime cutoff = OffsetDateTime.now().minusDays(properties.purgeFailedAfterDays());
        final int deleted = cvGenerationRepository.deleteTerminalOlderThan(
                List.of(CvGenerationStatus.FAILED, CvGenerationStatus.CANCELLED), cutoff);
        if (deleted > 0) {
            log.info("[CvGenerationWorker] - PURGE: deletedCount: {}", deleted);
        }
        return deleted;
    }

    private void markFailed(final CvGeneration generation, final String errorCode, final String errorMessage) {
        generation.setStatus(CvGenerationStatus.FAILED);
        generation.setErrorCode(errorCode);
        generation.setErrorMessage(truncate(errorMessage));
        generation.setLeaseOwner(null);
        generation.setLeaseExpiresAt(null);
        generation.setCompletedAt(OffsetDateTime.now());
        cvGenerationRepository.save(generation);
        log.warn(
                "[CvGenerationWorker] - FAILED: cvGenerationId: {}, errorCode: {}, correlationId: {}",
                generation.getCvGenerationId(),
                errorCode,
                generation.getCorrelationId());
    }

    private static String safeMessage(final String message) {
        if (message == null || message.isBlank()) {
            return "CV generation failed";
        }
        return truncate(message);
    }

    private static String truncate(final String message) {
        if (message == null) {
            return null;
        }
        return message.length() <= 512 ? message : message.substring(0, 512);
    }

    private record WorkItem(
            String baseCvObjectKey,
            String originalFilename,
            String contentType,
            GeneratedCvFormat format,
            String jobDescription,
            String additionalInfo,
            UUID correlationId) {}

    private static final class RetrySignal extends RuntimeException {
        private final String errorCode;
        private final String errorMessage;
        private final boolean retryable;

        private RetrySignal(final String errorCode, final String errorMessage, final boolean retryable) {
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
            this.retryable = retryable;
        }

        private String errorCode() {
            return errorCode;
        }

        private String errorMessage() {
            return errorMessage;
        }

        private boolean retryable() {
            return retryable;
        }
    }
}
