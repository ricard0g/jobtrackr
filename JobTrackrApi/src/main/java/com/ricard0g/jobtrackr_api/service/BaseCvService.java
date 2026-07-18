package com.ricard0g.jobtrackr_api.service;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvDownloadDto;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvResponseDto;
import com.ricard0g.jobtrackr_api.exception.BaseCvException;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.exception.StorageUnavailableException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.repository.BaseCvRepository;
import com.ricard0g.jobtrackr_api.repository.CvGenerationRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.storage.BaseCvStorage;
import com.ricard0g.jobtrackr_api.validation.BaseCvValidator;
import com.ricard0g.jobtrackr_api.validation.ValidatedBaseCv;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class BaseCvService {

    public static final int MAX_BASE_CVS = 20;

    private final UserRepository userRepository;
    private final BaseCvRepository baseCvRepository;
    private final CvGenerationRepository cvGenerationRepository;
    private final BaseCvValidator baseCvValidator;
    private final BaseCvStorage baseCvStorage;

    @Transactional(readOnly = true)
    public List<BaseCvResponseDto> list(final UUID userId) {
        requireUser(userId);
        final List<BaseCvResponseDto> documents = baseCvRepository
                .findAllByUser_UserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(BaseCvResponseDto::from)
                .toList();
        log.info("[BaseCvService] - LIST: responseCount: {}, userId: {}", documents.size(), userId);
        return documents;
    }

    @Transactional
    public BaseCvResponseDto upload(final UUID userId, final MultipartFile file) {
        requireUser(userId);
        final ValidatedBaseCv validated = baseCvValidator.validate(file);

        final User lockedUser = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));
        ensureQuotaAvailable(userId);
        ensureNotDuplicate(userId, validated.sha256());

        final String objectKey = objectKey(userId, validated);
        try {
            baseCvStorage.upload(objectKey, validated.bytes(), validated.contentType());
        } catch (final StorageUnavailableException exception) {
            throw BaseCvException.storageUnavailable();
        }

        try {
            final BaseCv baseCv = BaseCv.create(
                    lockedUser,
                    objectKey,
                    validated.originalFilename(),
                    validated.format(),
                    validated.contentType(),
                    validated.bytes().length,
                    validated.sha256());
            final BaseCv saved = baseCvRepository.saveAndFlush(baseCv);
            log.info("[BaseCvService] - UPLOAD: baseCvId: {}, userId: {}", saved.getBaseCvId(), userId);
            return BaseCvResponseDto.from(saved);
        } catch (final RuntimeException exception) {
            compensateUpload(objectKey, userId);
            if (exception instanceof DataIntegrityViolationException) {
                throw BaseCvException.duplicate();
            }
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public BaseCvDownloadDto createDownload(final UUID userId, final Long baseCvId) {
        final BaseCv baseCv = requireOwnedBaseCv(userId, baseCvId);
        try {
            return new BaseCvDownloadDto(
                    baseCvStorage.createDownloadUri(baseCv.getObjectKey(), baseCv.getOriginalFilename()));
        } catch (final StorageUnavailableException exception) {
            throw BaseCvException.storageUnavailable();
        }
    }

    @Transactional
    public void delete(final UUID userId, final Long baseCvId) {
        final BaseCv baseCv = requireOwnedBaseCv(userId, baseCvId);
        if (cvGenerationRepository.existsByBaseCv_BaseCvIdAndStatusIn(
                baseCvId, List.of(CvGenerationStatus.PENDING, CvGenerationStatus.PROCESSING))) {
            throw CvGenerationException.baseCvInUse();
        }
        try {
            baseCvStorage.delete(baseCv.getObjectKey());
        } catch (final StorageUnavailableException exception) {
            throw BaseCvException.storageUnavailable();
        }
        baseCvRepository.delete(baseCv);
        baseCvRepository.flush();
        log.info("[BaseCvService] - DELETE: baseCvId: {}, userId: {}", baseCvId, userId);
    }

    private User requireUser(final UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }

    private BaseCv requireOwnedBaseCv(final UUID userId, final Long baseCvId) {
        return baseCvRepository.findByBaseCvIdAndUser_UserId(baseCvId, userId)
                .orElseThrow(BaseCvException::notFound);
    }

    private void ensureQuotaAvailable(final UUID userId) {
        if (baseCvRepository.countByUser_UserId(userId) >= MAX_BASE_CVS) {
            throw BaseCvException.limitReached();
        }
    }

    private void ensureNotDuplicate(final UUID userId, final String checksum) {
        if (baseCvRepository.existsByUser_UserIdAndSha256(userId, checksum)) {
            throw BaseCvException.duplicate();
        }
    }

    private String objectKey(final UUID userId, final ValidatedBaseCv baseCv) {
        return "users/" + userId + "/base-cvs/" + UUID.randomUUID() + "." + baseCv.format().extension();
    }

    private void compensateUpload(final String objectKey, final UUID userId) {
        try {
            baseCvStorage.delete(objectKey);
        } catch (final RuntimeException compensationFailure) {
            log.error("[BaseCvService] - COMPENSATE_UPLOAD: failed: true, userId: {}", userId);
        }
    }
}
