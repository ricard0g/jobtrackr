package com.ricard0g.jobtrackr_api.dto.CompanyDto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.ricard0g.jobtrackr_api.model.Company;

public record CompanyResponseDto(
        Long companyId,
        UUID userId,
        String companyName,
        String companyWebsiteUrl,
        String companyLocation,
        String companyType,
        String companyLogo,
        OffsetDateTime companyCreatedAt,
        OffsetDateTime companyUpdatedAt) {

    public static CompanyResponseDto from(final Company company) {
        return new CompanyResponseDto(
                company.getCompanyId(),
                company.getUser().getUserId(),
                company.getCompanyName(),
                company.getCompanyWebsiteUrl(),
                company.getCompanyLocation(),
                company.getCompanyType(),
                company.getCompanyLogo(),
                company.getCompanyCreatedAt(),
                company.getCompanyUpdatedAt());
    }
}
