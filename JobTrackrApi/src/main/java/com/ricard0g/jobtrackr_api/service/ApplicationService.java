package com.ricard0g.jobtrackr_api.service;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.UUID;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationResponseDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationStatusPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.StatusHistoryDto.StatusHistoryResponseDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.exception.DuplicateTagNameException;
import com.ricard0g.jobtrackr_api.exception.TooManyApplicationTagsException;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.exception.CompanyNotFoundException;
import com.ricard0g.jobtrackr_api.exception.InvalidApplicationSalaryRangeException;
import com.ricard0g.jobtrackr_api.exception.TagNotFoundException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.Company;
import com.ricard0g.jobtrackr_api.model.Tag;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.CompanyRepository;
import com.ricard0g.jobtrackr_api.repository.TagRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class ApplicationService {

    private static final int MAX_TAGS = 50;

    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final ApplicationRepository applicationRepository;
    private final TagRepository tagRepository;
    private final StatusHistoryService statusHistoryService;

    @Transactional(readOnly = true)
    public List<ApplicationResponseDto> getAllApplications(final UUID userId) {
        requireUser(userId);
        final List<ApplicationResponseDto> applications = applicationRepository.findAllForUser(userId).stream()
                .map(ApplicationResponseDto::from)
                .toList();
        log.info(
                "[ApplicationService] - GET_ALL_APPLICATIONS: responseCount: {}, userId: {}",
                applications.size(),
                userId);
        return applications;
    }

    @Transactional(readOnly = true)
    public ApplicationResponseDto getApplicationById(final UUID userId, final Long applicationId) {
        final Application application = requireApplicationForUser(userId, applicationId);
        log.info(
                "[ApplicationService] - GET_APPLICATION_BY_ID: applicationId: {}, userId: {}",
                applicationId,
                userId);
        return ApplicationResponseDto.from(application);
    }

    @Transactional(readOnly = true)
    public List<StatusHistoryResponseDto> getStatusHistory(final UUID userId, final Long applicationId) {
        return statusHistoryService.getStatusHistoryForApplication(userId, applicationId);
    }

    @Transactional
    public ApplicationResponseDto createApplication(final UUID userId, final ApplicationCreateRequestDto dto) {
        final User user = requireUser(userId);
        final Company company = requireCompanyForUser(userId, dto.companyId());
        validateSalaryRange(dto.applicationSalaryMin(), dto.applicationSalaryMax());
        final Set<Tag> tags = resolveTags(dto.tagIds());
        final Application application = Application.create(
                user,
                company,
                dto.applicationTitle().trim(),
                dto.applicationStatus(),
                dto.applicationKanbanOrder(),
                normalizeOptional(dto.applicationJobUrl()),
                normalizeOptional(dto.applicationLocation()),
                dto.applicationRemoteType(),
                normalizeOptional(dto.applicationSource()),
                dto.applicationSalaryMin(),
                dto.applicationSalaryMax(),
                normalizeOptional(dto.applicationCurrency()),
                dto.applicationAppliedAt(),
                tags);
        final Application saved = applicationRepository.save(application);
        log.info(
                "[ApplicationService] - CREATE_APPLICATION: applicationId: {}, userId: {}",
                saved.getApplicationId(),
                userId);
        return ApplicationResponseDto.from(saved);
    }

    @Transactional
    public ApplicationResponseDto replaceApplication(
            final UUID userId, final Long applicationId, final ApplicationPutRequestDto dto) {
        final Application application = requireApplicationForUser(userId, applicationId);
        final Company company = requireCompanyForUser(userId, dto.companyId());
        validateSalaryRange(dto.applicationSalaryMin(), dto.applicationSalaryMax());
        application.setCompany(company);
        application.setApplicationTitle(dto.applicationTitle().trim());
        application.setApplicationKanbanOrder(
                dto.applicationKanbanOrder() != null ? dto.applicationKanbanOrder() : 0);
        application.setApplicationJobUrl(normalizeOptional(dto.applicationJobUrl()));
        application.setApplicationLocation(normalizeOptional(dto.applicationLocation()));
        application.setApplicationRemoteType(dto.applicationRemoteType());
        application.setApplicationSource(normalizeOptional(dto.applicationSource()));
        application.setApplicationSalaryMin(dto.applicationSalaryMin());
        application.setApplicationSalaryMax(dto.applicationSalaryMax());
        application.setApplicationCurrency(normalizeOptional(dto.applicationCurrency()));
        application.setApplicationAppliedAt(dto.applicationAppliedAt());
        final Application saved = applicationRepository.save(application);
        log.info(
                "[ApplicationService] - REPLACE_APPLICATION: applicationId: {}, userId: {}",
                applicationId,
                userId);
        return ApplicationResponseDto.from(saved);
    }

    @Transactional
    public ApplicationResponseDto patchApplication(
            final UUID userId, final Long applicationId, final ApplicationPatchRequestDto dto) {
        final Application application = requireApplicationForUser(userId, applicationId);
        if (dto.companyId() != null) {
            application.setCompany(requireCompanyForUser(userId, dto.companyId()));
        }
        if (dto.applicationTitle() != null) {
            application.setApplicationTitle(dto.applicationTitle().trim());
        }
        if (dto.applicationKanbanOrder() != null) {
            application.setApplicationKanbanOrder(dto.applicationKanbanOrder());
        }
        if (dto.applicationJobUrl() != null) {
            application.setApplicationJobUrl(normalizeOptional(dto.applicationJobUrl()));
        }
        if (dto.applicationLocation() != null) {
            application.setApplicationLocation(normalizeOptional(dto.applicationLocation()));
        }
        if (dto.applicationRemoteType() != null) {
            application.setApplicationRemoteType(dto.applicationRemoteType());
        }
        if (dto.applicationSource() != null) {
            application.setApplicationSource(normalizeOptional(dto.applicationSource()));
        }
        if (dto.applicationSalaryMin() != null) {
            application.setApplicationSalaryMin(dto.applicationSalaryMin());
        }
        if (dto.applicationSalaryMax() != null) {
            application.setApplicationSalaryMax(dto.applicationSalaryMax());
        }
        if (dto.applicationCurrency() != null) {
            application.setApplicationCurrency(normalizeOptional(dto.applicationCurrency()));
        }
        if (dto.applicationAppliedAt() != null) {
            application.setApplicationAppliedAt(dto.applicationAppliedAt());
        }
        validateSalaryRange(application.getApplicationSalaryMin(), application.getApplicationSalaryMax());
        patchTags(application, dto.addTagIds(), dto.removeTagIds());
        final Application saved = applicationRepository.save(application);
        log.info(
                "[ApplicationService] - PATCH_APPLICATION: applicationId: {}, userId: {}",
                applicationId,
                userId);
        return ApplicationResponseDto.from(saved);
    }

    @Transactional
    public ApplicationResponseDto patchApplicationStatus(
            final UUID userId,
            final Long applicationId,
            final ApplicationStatusPatchRequestDto dto) {
        final Application application = requireApplicationForUserWithLock(userId, applicationId);
        final ApplicationStatus oldStatus = application.getApplicationStatus();
        final ApplicationStatus newStatus = dto.applicationStatus();
        if (!oldStatus.equals(newStatus)) {
            statusHistoryService.recordStatusChange(application, oldStatus, newStatus);
            application.setApplicationStatus(newStatus);
        }
        final Application saved = applicationRepository.save(application);
        log.info(
                "[ApplicationService] - PATCH_APPLICATION_STATUS: applicationId: {}, userId: {}, oldStatus: {}, newStatus: {}",
                applicationId,
                userId,
                oldStatus,
                newStatus);
        return ApplicationResponseDto.from(saved);
    }

    @Transactional
    public TagResponseDto createAndAttachTag(
            final UUID userId, final Long applicationId, final CreateTagRequestDto request) {
        final Application application = requireApplicationForUser(userId, applicationId);
        if (tagRepository.existsByTagName(request.tagName())) {
            throw new DuplicateTagNameException(request.tagName());
        }
        ensureTagCountWithinLimit(application, 1);
        final Tag tag = Tag.create(request.tagCategory(), request.tagName(), request.tagColor());
        final Tag savedTag = tagRepository.save(tag);
        application.getTags().add(savedTag);
        applicationRepository.save(application);
        log.info(
                "[ApplicationService] - CREATE_AND_ATTACH_TAG: tagId: {}, applicationId: {}, userId: {}",
                savedTag.getTagId(),
                applicationId,
                userId);
        return TagResponseDto.from(savedTag);
    }

    @Transactional
    public void deleteApplication(final UUID userId, final Long applicationId) {
        final Application application = requireApplicationForUser(userId, applicationId);
        applicationRepository.delete(application);
        log.info(
                "[ApplicationService] - DELETE_APPLICATION: applicationId: {}, userId: {}",
                applicationId,
                userId);
    }

    private User requireUser(final UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }

    private Company requireCompanyForUser(final UUID userId, final Long companyId) {
        return companyRepository
                .findForUser(companyId, userId)
                .orElseThrow(() -> new CompanyNotFoundException(userId, companyId));
    }

    private Application requireApplicationForUser(final UUID userId, final Long applicationId) {
        return applicationRepository
                .findForUser(applicationId, userId)
                .orElseThrow(() -> new ApplicationNotFoundException(userId, applicationId));
    }

    private Application requireApplicationForUserWithLock(final UUID userId, final Long applicationId) {
        return applicationRepository
                .findForUserWithLock(applicationId, userId)
                .orElseThrow(() -> new ApplicationNotFoundException(userId, applicationId));
    }

    private void validateSalaryRange(final BigDecimal salaryMin, final BigDecimal salaryMax) {
        if (salaryMin == null || salaryMax == null) {
            return;
        }
        final boolean maxLessThanMin = salaryMax.compareTo(salaryMin) < 0;
        if (maxLessThanMin) {
            throw new InvalidApplicationSalaryRangeException(salaryMin, salaryMax);
        }
    }

    private void patchTags(
            final Application application, final List<Long> addTagIds, final List<Long> removeTagIds) {
        if (removeTagIds != null && !removeTagIds.isEmpty()) {
            final Set<Long> idsToRemove = new HashSet<>(removeTagIds);
            application.getTags().removeIf(tag -> idsToRemove.contains(tag.getTagId()));
        }
        if (addTagIds != null && !addTagIds.isEmpty()) {
            application.getTags().addAll(resolveTags(addTagIds));
        }
        ensureTagCountWithinLimit(application, 0);
    }

    private void ensureTagCountWithinLimit(final Application application, final int additionalTags) {
        final int projectedCount = application.getTags().size() + additionalTags;
        if (projectedCount > MAX_TAGS) {
            throw new TooManyApplicationTagsException(application.getApplicationId(), MAX_TAGS);
        }
    }

    private Set<Tag> resolveTags(final List<Long> tagIds) {
        if (tagIds == null || tagIds.isEmpty()) {
            return new HashSet<>();
        }
        final List<Tag> foundTags = tagRepository.findAllByTagIdIn(tagIds);
        if (foundTags.size() != tagIds.size()) {
            final Set<Long> foundIds = foundTags.stream().map(Tag::getTagId).collect(Collectors.toSet());
            final Long missingTagId = tagIds.stream()
                    .filter(tagId -> !foundIds.contains(tagId))
                    .findFirst()
                    .orElseThrow();
            throw new TagNotFoundException(missingTagId);
        }
        return new HashSet<>(foundTags);
    }

    private String normalizeOptional(final String value) {
        if (value == null) {
            return null;
        }
        final String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
