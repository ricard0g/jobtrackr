package com.ricard0g.jobtrackr_api.dto.StatusHistoryDto;

import java.time.OffsetDateTime;

import com.ricard0g.jobtrackr_api.model.StatusHistory;
import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;

public record StatusHistoryResponseDto(
        Long statusHistoryId,
        Long applicationId,
        ApplicationStatus statusHistoryOldStatus,
        ApplicationStatus statusHistoryNewStatus,
        OffsetDateTime statusHistoryChangedAt,
        OffsetDateTime statusHistoryCreatedAt) {

    public static StatusHistoryResponseDto from(final StatusHistory statusHistory, final Long applicationId) {
        return new StatusHistoryResponseDto(
                statusHistory.getStatusHistoryId(),
                applicationId,
                statusHistory.getStatusHistoryOldStatus(),
                statusHistory.getStatusHistoryNewStatus(),
                statusHistory.getStatusHistoryChangedAt(),
                statusHistory.getStatusHistoryCreatedAt());
    }
}
