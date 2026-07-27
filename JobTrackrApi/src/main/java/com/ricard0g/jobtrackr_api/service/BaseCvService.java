package com.ricard0g.jobtrackr_api.service;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.ricard0g.jobtrackr_api.conversion.GotenbergClient;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvDownloadDto;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvPreviewDto;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvResponseDto;
import com.ricard0g.jobtrackr_api.exception.BaseCvException;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.exception.DocumentConversionException;
import com.ricard0g.jobtrackr_api.exception.StorageUnavailableException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.StorageCleanupJob;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.repository.BaseCvRepository;
import com.ricard0g.jobtrackr_api.repository.CvGenerationRepository;
import com.ricard0g.jobtrackr_api.repository.StorageCleanupJobRepository;
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
    private static final String MARKDOWN_PREVIEW_CONTENT_TYPE = "text/markdown; charset=UTF-8";
    private static final String APPLICATION_PDF = "application/pdf";

    private final UserRepository userRepository;
    private final BaseCvRepository baseCvRepository;
    private final CvGenerationRepository cvGenerationRepository;
    private final BaseCvValidator baseCvValidator;
    private final BaseCvStorage baseCvStorage;
    private final GotenbergClient gotenbergClient;
    private final StorageCleanupJobRepository storageCleanupJobRepository;
    private final ConcurrentHashMap<Long, CompletableFuture<byte[]>> inFlightDocxConversions =
            new ConcurrentHashMap<>();

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

    public BaseCvPreviewDto preview(final UUID userId, final Long baseCvId) {
        final BaseCv baseCv = requireOwnedBaseCv(userId, baseCvId);
        if (baseCv.getFormat() == BaseCvFormat.DOCX) {
            return previewDocx(userId, baseCv);
        }
        final boolean previewSupported =
                baseCv.getFormat() == BaseCvFormat.PDF || baseCv.getFormat() == BaseCvFormat.MARKDOWN;
        if (!previewSupported) {
            throw BaseCvException.previewUnsupportedFormat();
        }
        try {
            final byte[] bytes = baseCvStorage.download(baseCv.getObjectKey());
            final String contentType = baseCv.getFormat() == BaseCvFormat.MARKDOWN
                    ? MARKDOWN_PREVIEW_CONTENT_TYPE
                    : baseCv.getContentType();
            return new BaseCvPreviewDto(bytes, contentType, baseCv.getOriginalFilename());
        } catch (final StorageUnavailableException exception) {
            throw BaseCvException.previewUnavailable();
        }
    }

    private BaseCvPreviewDto previewDocx(final UUID userId, final BaseCv baseCv) {
        final String previewKey = previewObjectKey(userId, baseCv.getBaseCvId());
        final String previewFilename = previewPdfFilename(baseCv.getOriginalFilename());
        try {
            if (baseCvStorage.exists(previewKey)) {
                final byte[] cached = baseCvStorage.download(previewKey);
                return new BaseCvPreviewDto(cached, APPLICATION_PDF, previewFilename);
            }
            final byte[] pdfBytes = convertAndCacheDocx(userId, baseCv, previewKey);
            return new BaseCvPreviewDto(pdfBytes, APPLICATION_PDF, previewFilename);
        } catch (final StorageUnavailableException | DocumentConversionException exception) {
            throw BaseCvException.previewUnavailable();
        }
    }

    private byte[] convertAndCacheDocx(final UUID userId, final BaseCv baseCv, final String previewKey) {
        final Long baseCvId = baseCv.getBaseCvId();
        final CompletableFuture<byte[]> conversion = new CompletableFuture<>();
        final CompletableFuture<byte[]> existing = inFlightDocxConversions.putIfAbsent(baseCvId, conversion);
        if (existing != null) {
            return awaitConversion(existing);
        }
        try {
            final byte[] docxBytes = baseCvStorage.download(baseCv.getObjectKey());
            final byte[] pdfBytes = gotenbergClient.convertDocxToPdf(docxBytes, baseCv.getOriginalFilename());
            if (baseCvRepository.findByBaseCvIdAndUser_UserId(baseCvId, userId).isEmpty()) {
                final BaseCvException notFound = BaseCvException.notFound();
                conversion.completeExceptionally(notFound);
                throw notFound;
            }
            baseCvStorage.upload(previewKey, pdfBytes, APPLICATION_PDF);
            conversion.complete(pdfBytes);
            return pdfBytes;
        } catch (final RuntimeException exception) {
            conversion.completeExceptionally(exception);
            throw exception;
        } finally {
            inFlightDocxConversions.remove(baseCvId, conversion);
        }
    }

    private static byte[] awaitConversion(final CompletableFuture<byte[]> conversion) {
        try {
            return conversion.join();
        } catch (final java.util.concurrent.CompletionException exception) {
            final Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw exception;
        }
    }

    static String previewObjectKey(final UUID userId, final Long baseCvId) {
        return "users/" + userId + "/previews/base-cvs/" + baseCvId + ".pdf";
    }

    private static String previewPdfFilename(final String originalFilename) {
        final int extensionIndex = originalFilename.lastIndexOf('.');
        if (extensionIndex <= 0) {
            return originalFilename + ".pdf";
        }
        return originalFilename.substring(0, extensionIndex) + ".pdf";
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
        schedulePreviewCleanup(previewObjectKey(userId, baseCvId));
        log.info("[BaseCvService] - DELETE: baseCvId: {}, userId: {}", baseCvId, userId);
    }

    private void schedulePreviewCleanup(final String previewObjectKey) {
        if (!storageCleanupJobRepository.findByObjectKeyAndCompletedAtIsNull(previewObjectKey).isEmpty()) {
            return;
        }
        try {
            storageCleanupJobRepository.save(StorageCleanupJob.create(previewObjectKey));
        } catch (final DataIntegrityViolationException ignored) {
            // concurrent schedule
        }
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
