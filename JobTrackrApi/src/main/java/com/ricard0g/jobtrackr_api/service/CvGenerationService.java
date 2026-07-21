package com.ricard0g.jobtrackr_api.service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.dto.CvGenerationDto.CvGenerationDtos;
import com.ricard0g.jobtrackr_api.dto.CvGenerationDto.JobDescriptionResponseDto;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.CvGeneration;
import com.ricard0g.jobtrackr_api.model.JobDescription;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.repository.ApplicationCvRepository;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.BaseCvRepository;
import com.ricard0g.jobtrackr_api.repository.CvGenerationRepository;
import com.ricard0g.jobtrackr_api.repository.JobDescriptionRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class CvGenerationService {

    private final UserRepository userRepository;
    private final ApplicationRepository applicationRepository;
    private final BaseCvRepository baseCvRepository;
    private final JobDescriptionRepository jobDescriptionRepository;
    private final CvGenerationRepository cvGenerationRepository;
    private final ApplicationCvRepository applicationCvRepository;
    private final CvGenerationProperties properties;

    @Transactional
    public CvGenerationDtos.Response create(
            final UUID userId, final String idempotencyKey, final CvGenerationDtos.CreateRequest request) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw CvGenerationException.missingIdempotencyKey();
        }
        final String normalizedKey = idempotencyKey.trim();
        if (normalizedKey.isEmpty() || normalizedKey.length() > 128) {
            throw CvGenerationException.invalidIdempotencyKey();
        }

        final var existing = cvGenerationRepository.findByUser_UserIdAndIdempotencyKey(userId, normalizedKey);
        if (existing.isPresent()) {
            log.info(
                    "[CvGenerationService] - CREATE_IDEMPOTENT: cvGenerationId: {}, userId: {}",
                    existing.get().getCvGenerationId(),
                    userId);
            return CvGenerationDtos.Response.from(existing.get());
        }

        final User user = requireUser(userId);
        ensureConsent(user, request.consentAccepted());
        validateTextLimits(request);

        final Application application = requireApplication(userId, request.applicationId());
        final BaseCv baseCv = baseCvRepository
                .findByBaseCvIdAndUser_UserId(request.baseCvId(), userId)
                .orElseThrow(CvGenerationException::baseCvUnavailable);

        if (applicationCvRepository.countByApplication_ApplicationId(application.getApplicationId())
                >= properties.maxApplicationCvs()) {
            throw CvGenerationException.generationLimitReached();
        }

        upsertJobDescription(application, request.jobDescription().trim());

        final String additional = request.additionalInformation() == null
                || request.additionalInformation().isBlank()
                        ? null
                        : request.additionalInformation().trim();

        final CvGeneration generation = CvGeneration.create(
                user,
                application,
                baseCv,
                normalizedKey,
                request.format(),
                request.jobDescription().trim(),
                additional,
                properties.consentVersion(),
                properties.maxAttempts());

        try {
            final CvGeneration saved = cvGenerationRepository.saveAndFlush(generation);
            log.info(
                    "[CvGenerationService] - CREATE: cvGenerationId: {}, applicationId: {}, userId: {}, correlationId: {}",
                    saved.getCvGenerationId(),
                    application.getApplicationId(),
                    userId,
                    saved.getCorrelationId());
            return CvGenerationDtos.Response.from(saved);
        } catch (final DataIntegrityViolationException exception) {
            return cvGenerationRepository
                    .findByUser_UserIdAndIdempotencyKey(userId, normalizedKey)
                    .map(CvGenerationDtos.Response::from)
                    .orElseThrow(() -> exception);
        }
    }

    @Transactional(readOnly = true)
    public List<CvGenerationDtos.Response> listForUser(final UUID userId) {
        requireUser(userId);
        return cvGenerationRepository.findAllByUser_UserIdOrderByCreatedAtDesc(userId).stream()
                .map(CvGenerationDtos.Response::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CvGenerationDtos.Response> listForApplication(final UUID userId, final Long applicationId) {
        requireApplication(userId, applicationId);
        return cvGenerationRepository
                .findAllByApplication_ApplicationIdAndUser_UserIdOrderByCreatedAtDesc(applicationId, userId)
                .stream()
                .map(CvGenerationDtos.Response::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public CvGenerationDtos.Response get(final UUID userId, final Long cvGenerationId) {
        return CvGenerationDtos.Response.from(requireOwned(userId, cvGenerationId));
    }

    @Transactional
    public CvGenerationDtos.Response cancel(final UUID userId, final Long cvGenerationId) {
        final CvGeneration generation = requireOwned(userId, cvGenerationId);
        if (generation.getStatus() != CvGenerationStatus.PENDING) {
            throw CvGenerationException.invalidStatusTransition();
        }
        generation.setStatus(CvGenerationStatus.CANCELLED);
        generation.setCompletedAt(OffsetDateTime.now());
        generation.setErrorCode("CANCELLED");
        generation.setErrorMessage("Generation cancelled by user");
        final CvGeneration saved = cvGenerationRepository.save(generation);
        log.info(
                "[CvGenerationService] - CANCEL: cvGenerationId: {}, userId: {}, correlationId: {}",
                cvGenerationId,
                userId,
                saved.getCorrelationId());
        return CvGenerationDtos.Response.from(saved);
    }

    @Transactional
    public CvGenerationDtos.ConsentResponse recordConsent(final UUID userId, final boolean accepted) {
        if (!accepted) {
            throw CvGenerationException.consentRequired();
        }
        final User user = requireUser(userId);
        user.setUserAiConsentVersion(properties.consentVersion());
        user.setUserAiConsentAt(OffsetDateTime.now());
        userRepository.save(user);
        log.info("[CvGenerationService] - CONSENT: userId: {}, version: {}", userId, properties.consentVersion());
        return new CvGenerationDtos.ConsentResponse(
                properties.consentVersion(), user.getUserAiConsentAt(), true);
    }

    @Transactional(readOnly = true)
    public CvGenerationDtos.ConsentResponse getConsent(final UUID userId) {
        final User user = requireUser(userId);
        final boolean current = properties.consentVersion().equals(user.getUserAiConsentVersion())
                && user.getUserAiConsentAt() != null;
        return new CvGenerationDtos.ConsentResponse(
                user.getUserAiConsentVersion(), user.getUserAiConsentAt(), current);
    }

    @Transactional(readOnly = true)
    public JobDescriptionResponseDto getJobDescription(final UUID userId, final Long applicationId) {
        requireApplication(userId, applicationId);
        final String text = jobDescriptionRepository
                .findByApplication_ApplicationId(applicationId)
                .map(JobDescription::getJobDescriptionText)
                .orElse("");
        return new JobDescriptionResponseDto(applicationId, text);
    }

    private void ensureConsent(final User user, final boolean consentAccepted) {
        final boolean hasCurrentConsent = properties.consentVersion().equals(user.getUserAiConsentVersion())
                && user.getUserAiConsentAt() != null;
        if (hasCurrentConsent) {
            return;
        }
        if (!consentAccepted) {
            throw CvGenerationException.consentRequired();
        }
        user.setUserAiConsentVersion(properties.consentVersion());
        user.setUserAiConsentAt(OffsetDateTime.now());
        userRepository.save(user);
    }

    private void validateTextLimits(final CvGenerationDtos.CreateRequest request) {
        if (request.jobDescription() == null || request.jobDescription().isBlank()) {
            throw CvGenerationException.missingJobDescription();
        }
        if (request.jobDescription().length() > properties.maxJobDescriptionChars()) {
            throw CvGenerationException.jobDescriptionTooLong();
        }
        if (request.additionalInformation() != null
                && request.additionalInformation().length() > properties.maxAdditionalInfoChars()) {
            throw CvGenerationException.additionalInfoTooLong();
        }
        if (request.format() == null) {
            throw CvGenerationException.invalidFormat();
        }
    }

    private void upsertJobDescription(final Application application, final String text) {
        final JobDescription existing = jobDescriptionRepository
                .findByApplication_ApplicationId(application.getApplicationId())
                .orElse(null);
        if (existing == null) {
            jobDescriptionRepository.save(JobDescription.create(application, text));
            return;
        }
        existing.replaceText(text);
        jobDescriptionRepository.save(existing);
    }

    private User requireUser(final UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }

    private Application requireApplication(final UUID userId, final Long applicationId) {
        return applicationRepository
                .findForUser(applicationId, userId)
                .orElseThrow(() -> new ApplicationNotFoundException(userId, applicationId));
    }

    private CvGeneration requireOwned(final UUID userId, final Long cvGenerationId) {
        return cvGenerationRepository
                .findByCvGenerationIdAndUser_UserId(cvGenerationId, userId)
                .orElseThrow(CvGenerationException::notFound);
    }
}
