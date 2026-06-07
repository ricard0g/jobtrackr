package com.ricard0g.jobtrackr_api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyCreateRequestDto;
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
    public List<CompanyResponseDto> getAllCompanies(final Long userId) {
        requireUser(userId);
        final List<CompanyResponseDto> companies = companyRepository.findAllForUser(userId).stream()
                .map(CompanyResponseDto::from)
                .toList();
        log.info("[CompanyService] - GET_ALL_COMPANIES: responseCount: {}, userId: {}", companies.size(), userId);
        return companies;
    }

    @Transactional(readOnly = true)
    public CompanyResponseDto getCompanyById(final Long userId, final Long companyId) {
        final Company company = requireCompanyForUser(userId, companyId);
        log.info("[CompanyService] - GET_COMPANY_BY_ID: companyId: {}, userId: {}", companyId, userId);
        return CompanyResponseDto.from(company);
    }

    @Transactional
    public CompanyResponseDto createCompany(final Long userId, final CompanyCreateRequestDto dto) {
        final User user = requireUser(userId);
        final String companyName = dto.companyName().trim();
        final boolean nameAlreadyExists = companyRepository.nameExistsForUser(userId, companyName);
        if (nameAlreadyExists) {
            throw new DuplicateCompanyNameException(userId, companyName);
        }
        final Company company = Company.create(
                user,
                companyName,
                normalizeOptional(dto.companyWebsiteUrl()),
                normalizeOptional(dto.companyLocation()),
                normalizeOptional(dto.companyType()),
                normalizeOptional(dto.companyLogo()));
        final Company saved = companyRepository.save(company);
        log.info("[CompanyService] - CREATE_COMPANY: companyId: {}, userId: {}", saved.getCompanyId(), userId);
        return CompanyResponseDto.from(saved);
    }

    @Transactional
    public CompanyResponseDto replaceCompany(
            final Long userId, final Long companyId, final CompanyPutRequestDto dto) {
        final Company company = requireCompanyForUser(userId, companyId);
        final String companyName = dto.companyName().trim();
        final boolean nameAlreadyExists =
                companyRepository.nameExistsForUserExcludingCompany(userId, companyName, companyId);
        if (nameAlreadyExists) {
            throw new DuplicateCompanyNameException(userId, companyName);
        }
        company.setCompanyName(companyName);
        company.setCompanyWebsiteUrl(normalizeOptional(dto.companyWebsiteUrl()));
        company.setCompanyLocation(normalizeOptional(dto.companyLocation()));
        company.setCompanyType(normalizeOptional(dto.companyType()));
        company.setCompanyLogo(normalizeOptional(dto.companyLogo()));
        final Company saved = companyRepository.save(company);
        log.info("[CompanyService] - REPLACE_COMPANY: companyId: {}, userId: {}", companyId, userId);
        return CompanyResponseDto.from(saved);
    }

    @Transactional
    public void deleteCompany(final Long userId, final Long companyId) {
        final Company company = requireCompanyForUser(userId, companyId);
        final boolean hasApplications = applicationRepository.hasApplications(companyId);
        if (hasApplications) {
            throw new CompanyHasApplicationsException(companyId);
        }
        companyRepository.delete(company);
        log.info("[CompanyService] - DELETE_COMPANY: companyId: {}, userId: {}", companyId, userId);
    }

    private User requireUser(final Long userId) {
        return userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }

    private Company requireCompanyForUser(final Long userId, final Long companyId) {
        return companyRepository
                .findForUser(companyId, userId)
                .orElseThrow(() -> new CompanyNotFoundException(userId, companyId));
    }

    private String normalizeOptional(final String value) {
        if (value == null) {
            return null;
        }
        final String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
