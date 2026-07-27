package com.ricard0g.jobtrackr_api.service;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.dto.GeneratedCvDto.GeneratedCvDtos;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.ApplicationCv;
import com.ricard0g.jobtrackr_api.model.StorageCleanupJob;
import com.ricard0g.jobtrackr_api.repository.ApplicationCvRepository;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.StorageCleanupJobRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.storage.ObjectStorage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class ApplicationCvService {

    private static final String USERS_PREFIX = "users/";
    private static final String GENERATED_CV_PREVIEW_PREFIX = "/previews/generated-cvs/";
    private static final String PDF_SUFFIX = ".pdf";

    private final UserRepository userRepository;
    private final ApplicationRepository applicationRepository;
    private final ApplicationCvRepository applicationCvRepository;
    private final StorageCleanupJobRepository storageCleanupJobRepository;
    private final ObjectStorage objectStorage;
    private final CvGenerationProperties properties;

    @Transactional(readOnly = true)
    public List<GeneratedCvDtos.Response> listForApplication(final UUID userId, final Long applicationId) {
        requireApplication(userId, applicationId);
        return applicationCvRepository
                .findAllByApplication_ApplicationIdAndApplication_User_UserIdOrderByVersionDesc(
                        applicationId, userId)
                .stream()
                .map(GeneratedCvDtos.Response::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public GeneratedCvDtos.PageResponse listForUser(final UUID userId, final Pageable pageable) {
        requireUser(userId);
        final Page<GeneratedCvDtos.Summary> page = applicationCvRepository
                .findAllByApplication_User_UserId(userId, pageable)
                .map(GeneratedCvDtos.Summary::from);
        return GeneratedCvDtos.PageResponse.from(page);
    }

    @Transactional(readOnly = true)
    public GeneratedCvDtos.Download createDownload(final UUID userId, final Long applicationCvId) {
        final ApplicationCv applicationCv = requireOwned(userId, applicationCvId);
        try {
            return new GeneratedCvDtos.Download(objectStorage
                    .createDownloadUri(applicationCv.getObjectKey(), applicationCv.getOriginalFilename())
                    .toString());
        } catch (final RuntimeException exception) {
            throw CvGenerationException.storageUnavailable();
        }
    }

    @Transactional
    public void delete(final UUID userId, final Long applicationCvId) {
        final ApplicationCv applicationCv = requireOwned(userId, applicationCvId);
        final String objectKey = applicationCv.getObjectKey();
        final Long generatedCvId = applicationCv.getApplicationCvId();
        applicationCvRepository.delete(applicationCv);
        applicationCvRepository.flush();
        scheduleCleanup(objectKey);
        scheduleCleanup(previewObjectKey(userId, generatedCvId));
        log.info(
                "[ApplicationCvService] - DELETE: applicationCvId: {}, userId: {}",
                applicationCvId,
                userId);
    }

    @Transactional
    public void scheduleCleanupForApplication(final UUID userId, final Long applicationId) {
        final List<ApplicationCv> cvs = applicationCvRepository.findAllByApplication_ApplicationId(applicationId);
        for (final ApplicationCv cv : cvs) {
            scheduleCleanup(cv.getObjectKey());
            scheduleCleanup(previewObjectKey(userId, cv.getApplicationCvId()));
        }
    }

    public void scheduleCleanup(final String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return;
        }
        if (!storageCleanupJobRepository.findByObjectKeyAndCompletedAtIsNull(objectKey).isEmpty()) {
            return;
        }
        try {
            storageCleanupJobRepository.save(StorageCleanupJob.create(objectKey));
        } catch (final DataIntegrityViolationException ignored) {
            // concurrent schedule
        }
    }

    static String previewObjectKey(final UUID userId, final Long generatedCvId) {
        return USERS_PREFIX + userId + GENERATED_CV_PREVIEW_PREFIX + generatedCvId + PDF_SUFFIX;
    }

    public boolean hasCapacity(final Long applicationId) {
        return applicationCvRepository.countByApplication_ApplicationId(applicationId)
                < properties.maxApplicationCvs();
    }

    private Application requireApplication(final UUID userId, final Long applicationId) {
        requireUser(userId);
        return applicationRepository
                .findForUser(applicationId, userId)
                .orElseThrow(() -> new ApplicationNotFoundException(userId, applicationId));
    }

    private ApplicationCv requireOwned(final UUID userId, final Long applicationCvId) {
        return applicationCvRepository
                .findByApplicationCvIdAndApplication_User_UserId(applicationCvId, userId)
                .orElseThrow(CvGenerationException::generatedCvNotFound);
    }

    private void requireUser(final UUID userId) {
        userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }
}
