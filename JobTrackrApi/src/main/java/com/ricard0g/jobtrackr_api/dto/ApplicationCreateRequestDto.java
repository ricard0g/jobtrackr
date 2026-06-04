package com.ricard0g.jobtrackr_api.dto;

import static com.ricard0g.jobtrackr_api.validation.ValidationPatterns.OPTIONAL_HTTP_URL;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.model.enums.RemoteType;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record ApplicationCreateRequestDto(
        @NotNull @Positive Long companyId,
        @NotBlank @Size(max = 255) String applicationTitle,
        @NotNull ApplicationStatus applicationStatus,
        @Size(max = 1024) @Pattern(regexp = OPTIONAL_HTTP_URL) String applicationJobUrl,
        @Size(max = 255) String applicationLocation,
        RemoteType applicationRemoteType,
        @Size(max = 255) String applicationSource,
        @DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal applicationSalaryMin,
        @DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal applicationSalaryMax,
        @Size(min = 3, max = 3) @Pattern(regexp = "^[A-Z]{3}$") String applicationCurrency,
        @Min(0) Integer applicationKanbanOrder,
        OffsetDateTime applicationAppliedAt,
        @Size(max = 50) List<@Positive Long> tagIds) {}
