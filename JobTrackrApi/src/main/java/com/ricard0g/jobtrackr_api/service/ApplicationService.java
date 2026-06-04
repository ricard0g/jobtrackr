package com.ricard0g.jobtrackr_api.service;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.ApplicationCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationResponseDto;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.exception.CompanyNotFoundException;
import com.ricard0g.jobtrackr_api.exception.InvalidApplicationSalaryRangeException;
import com.ricard0g.jobtrackr_api.exception.TagNotFoundException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.Company;
import com.ricard0g.jobtrackr_api.model.Tag;
import com.ricard0g.jobtrackr_api.model.User;
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

    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final ApplicationRepository applicationRepository;
    private final TagRepository tagRepository;

    @Transactional(readOnly = true)
    public List<ApplicationResponseDto> getAllApplications(final Long userId) {
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
    public ApplicationResponseDto getApplicationById(final Long userId, final Long applicationId) {
        final Application application = requireApplicationForUser(userId, applicationId);
        log.info(
                "[ApplicationService] - GET_APPLICATION_BY_ID: applicationId: {}, userId: {}",
                applicationId,
                userId);
        return ApplicationResponseDto.from(application);
    }

    @Transactional
    public ApplicationResponseDto createApplication(final Long userId, final ApplicationCreateRequestDto dto) {
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
    public void deleteApplication(final Long userId, final Long applicationId) {
        final Application application = requireApplicationForUser(userId, applicationId);
        applicationRepository.delete(application);
        log.info(
                "[ApplicationService] - DELETE_APPLICATION: applicationId: {}, userId: {}",
                applicationId,
                userId);
    }

    private User requireUser(final Long userId) {
        return userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }

    private Company requireCompanyForUser(final Long userId, final Long companyId) {
        return companyRepository
                .findForUser(companyId, userId)
                .orElseThrow(() -> new CompanyNotFoundException(userId, companyId));
    }

    private Application requireApplicationForUser(final Long userId, final Long applicationId) {
        return applicationRepository
                .findForUser(applicationId, userId)
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
