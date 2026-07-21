package com.ricard0g.jobtrackr_api.service;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.dto.ApplicationCvDto.ApplicationCvDtos;
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

    private final UserRepository userRepository;
    private final ApplicationRepository applicationRepository;
    private final ApplicationCvRepository applicationCvRepository;
    private final StorageCleanupJobRepository storageCleanupJobRepository;
    private final ObjectStorage objectStorage;
    private final CvGenerationProperties properties;

    @Transactional(readOnly = true)
    public List<ApplicationCvDtos.Response> listForApplication(final UUID userId, final Long applicationId) {
        requireApplication(userId, applicationId);
        return applicationCvRepository
                .findAllByApplication_ApplicationIdAndApplication_User_UserIdOrderByVersionDesc(
                        applicationId, userId)
                .stream()
                .map(ApplicationCvDtos.Response::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ApplicationCvDtos.Download createDownload(final UUID userId, final Long applicationCvId) {
        final ApplicationCv applicationCv = requireOwned(userId, applicationCvId);
        try {
            return new ApplicationCvDtos.Download(objectStorage
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
        applicationCvRepository.delete(applicationCv);
        applicationCvRepository.flush();
        scheduleCleanup(objectKey);
        log.info(
                "[ApplicationCvService] - DELETE: applicationCvId: {}, userId: {}",
                applicationCvId,
                userId);
    }

    @Transactional
    public void scheduleCleanupForApplication(final Long applicationId) {
        final List<ApplicationCv> cvs = applicationCvRepository.findAllByApplication_ApplicationId(applicationId);
        for (final ApplicationCv cv : cvs) {
            scheduleCleanup(cv.getObjectKey());
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
                .orElseThrow(CvGenerationException::applicationCvNotFound);
    }

    private void requireUser(final UUID userId) {
        userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }
}
