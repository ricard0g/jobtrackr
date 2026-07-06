package com.ricard0g.jobtrackr_api.service;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyPageResponseDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyResponseDto;
import com.ricard0g.jobtrackr_api.exception.CompanyHasApplicationsException;
import com.ricard0g.jobtrackr_api.exception.CompanyNotFoundException;
import com.ricard0g.jobtrackr_api.exception.DuplicateCompanyNameException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.Company;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.CompanyRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.util.CompanyLogoUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class CompanyService {

    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final ApplicationRepository applicationRepository;

    @Transactional(readOnly = true)
    public List<CompanyResponseDto> getAllCompanies(final UUID userId) {
        requireUser(userId);
        final List<CompanyResponseDto> companies = companyRepository.findAllGlobalAndByUserId(userId).stream()
                .sorted(Comparator.comparing(Company::getCompanyName))
                .map(CompanyResponseDto::from)
                .toList();
        log.info("[CompanyService] - GET_ALL_COMPANIES: responseCount: {}, userId: {}", companies.size(), userId);
        return companies;
    }

    @Transactional(readOnly = true)
    public CompanyPageResponseDto searchCompanies(
            final UUID userId, final String search, final Pageable pageable) {
        requireUser(userId);
        final String normalizedSearch = search == null ? "" : search.trim();
        final Page<CompanyResponseDto> page = companyRepository
                .findAllGlobalAndByUserId(userId, normalizedSearch, pageable)
                .map(CompanyResponseDto::from);
        log.info(
                "[CompanyService] - SEARCH_COMPANIES: total: {}, page: {}, size: {}, userId: {}",
                page.getTotalElements(),
                page.getNumber(),
                page.getSize(),
                userId);
        return CompanyPageResponseDto.from(page);
    }

    @Transactional(readOnly = true)
    public CompanyResponseDto getCompanyById(final UUID userId, final Long companyId) {
        final Company company = requireAccessibleCompany(userId, companyId);
        log.info("[CompanyService] - GET_COMPANY_BY_ID: companyId: {}, userId: {}", companyId, userId);
        return CompanyResponseDto.from(company);
    }

    @Transactional
    public CompanyResponseDto createCompany(final UUID userId, final CompanyCreateRequestDto dto) {
        final User user = requireUser(userId);
        final String companyName = dto.companyName().trim();
        ensureCompanyNameAvailable(userId, companyName);
        final String companyWebsiteUrl = normalizeOptional(dto.companyWebsiteUrl());
        final String companyLogo = resolveCompanyLogo(normalizeOptional(dto.companyLogo()), companyWebsiteUrl);
        final Company company = Company.create(
                user,
                companyName,
                companyWebsiteUrl,
                normalizeOptional(dto.companyLocation()),
                normalizeOptional(dto.companyType()),
                companyLogo);
        final Company saved = companyRepository.save(company);
        log.info("[CompanyService] - CREATE_COMPANY: companyId: {}, userId: {}", saved.getCompanyId(), userId);
        return CompanyResponseDto.from(saved);
    }

    @Transactional
    public CompanyResponseDto replaceCompany(
            final UUID userId, final Long companyId, final CompanyPutRequestDto dto) {
        final Company company = requireOwnedCompany(userId, companyId);
        final String companyName = dto.companyName().trim();
        ensureCompanyNameAvailableForReplace(userId, companyName, companyId);
        final String companyWebsiteUrl = normalizeOptional(dto.companyWebsiteUrl());
        company.setCompanyName(companyName);
        company.setCompanyWebsiteUrl(companyWebsiteUrl);
        company.setCompanyLocation(normalizeOptional(dto.companyLocation()));
        company.setCompanyType(normalizeOptional(dto.companyType()));
        company.setCompanyLogo(resolveCompanyLogo(normalizeOptional(dto.companyLogo()), companyWebsiteUrl));
        final Company saved = companyRepository.save(company);
        log.info("[CompanyService] - REPLACE_COMPANY: companyId: {}, userId: {}", companyId, userId);
        return CompanyResponseDto.from(saved);
    }

    @Transactional
    public void deleteCompany(final UUID userId, final Long companyId) {
        final Company company = requireOwnedCompany(userId, companyId);
        final boolean hasApplications = applicationRepository.hasApplications(companyId);
        if (hasApplications) {
            throw new CompanyHasApplicationsException(companyId);
        }
        companyRepository.delete(company);
        log.info("[CompanyService] - DELETE_COMPANY: companyId: {}, userId: {}", companyId, userId);
    }

    private User requireUser(final UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }

    private Company requireAccessibleCompany(final UUID userId, final Long companyId) {
        return companyRepository
                .findByCompanyIdAndAccessibleToUser(companyId, userId)
                .orElseThrow(() -> new CompanyNotFoundException(userId, companyId));
    }

    private Company requireOwnedCompany(final UUID userId, final Long companyId) {
        return companyRepository
                .findByCompanyIdAndUser_UserId(companyId, userId)
                .orElseThrow(() -> new CompanyNotFoundException(userId, companyId));
    }

    private void ensureCompanyNameAvailable(final UUID userId, final String companyName) {
        final boolean nameTaken = companyRepository.existsGlobalByCompanyName(companyName)
                || companyRepository.nameExistsForUser(userId, companyName);
        if (nameTaken) {
            throw new DuplicateCompanyNameException(userId, companyName);
        }
    }

    private void ensureCompanyNameAvailableForReplace(
            final UUID userId, final String companyName, final Long companyId) {
        final boolean globalConflict =
                companyRepository.existsGlobalByCompanyNameAndCompanyIdNot(companyName, companyId);
        final boolean userConflict =
                companyRepository.nameExistsForUserExcludingCompany(userId, companyName, companyId);
        if (globalConflict || userConflict) {
            throw new DuplicateCompanyNameException(userId, companyName);
        }
    }

    private String resolveCompanyLogo(final String companyLogo, final String companyWebsiteUrl) {
        if (companyLogo != null) {
            return companyLogo;
        }
        return CompanyLogoUtils.hunterLogoUrlFromWebsite(companyWebsiteUrl);
    }

    private String normalizeOptional(final String value) {
        if (value == null) {
            return null;
        }
        final String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
