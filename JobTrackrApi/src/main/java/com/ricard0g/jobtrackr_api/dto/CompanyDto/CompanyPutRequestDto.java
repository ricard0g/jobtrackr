package com.ricard0g.jobtrackr_api.dto.CompanyDto;

import static com.ricard0g.jobtrackr_api.validation.ValidationPatterns.OPTIONAL_HTTP_URL;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CompanyPutRequestDto(
        @NotBlank @Size(max = 255) String companyName,
        @Size(max = 1024) @Pattern(regexp = OPTIONAL_HTTP_URL) String companyWebsiteUrl,
        @Size(max = 255) String companyLocation,
        @Size(max = 100) String companyType,
        @Size(max = 1024) @Pattern(regexp = OPTIONAL_HTTP_URL) String companyLogo) {}
