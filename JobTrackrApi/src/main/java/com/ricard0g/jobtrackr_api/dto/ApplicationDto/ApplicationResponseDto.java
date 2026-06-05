package com.ricard0g.jobtrackr_api.dto.ApplicationDto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;

import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyResponseDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.model.enums.RemoteType;

public record ApplicationResponseDto(
        Long applicationId,
        Long userId,
        String applicationTitle,
        String applicationJobUrl,
        String applicationLocation,
        RemoteType applicationRemoteType,
        String applicationSource,
        BigDecimal applicationSalaryMin,
        BigDecimal applicationSalaryMax,
        String applicationCurrency,
        ApplicationStatus applicationStatus,
        Integer applicationKanbanOrder,
        OffsetDateTime applicationAppliedAt,
        OffsetDateTime applicationCreatedAt,
        OffsetDateTime applicationUpdatedAt,
        CompanyResponseDto company,
        List<TagResponseDto> tags) {

    public static ApplicationResponseDto from(final Application application) {
        final List<TagResponseDto> tagDtos = application.getTags().stream()
                .map(TagResponseDto::from)
                .sorted(Comparator.comparing(TagResponseDto::tagId))
                .toList();
        return new ApplicationResponseDto(
                application.getApplicationId(),
                application.getUser().getUserId(),
                application.getApplicationTitle(),
                application.getApplicationJobUrl(),
                application.getApplicationLocation(),
                application.getApplicationRemoteType(),
                application.getApplicationSource(),
                application.getApplicationSalaryMin(),
                application.getApplicationSalaryMax(),
                application.getApplicationCurrency(),
                application.getApplicationStatus(),
                application.getApplicationKanbanOrder(),
                application.getApplicationAppliedAt(),
                application.getApplicationCreatedAt(),
                application.getApplicationUpdatedAt(),
                CompanyResponseDto.from(application.getCompany()),
                tagDtos);
    }
}
