package com.ricard0g.jobtrackr_api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.StatusHistoryDto.StatusHistoryResponseDto;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.StatusHistory;
import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.StatusHistoryRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class StatusHistoryService {

    private final ApplicationRepository applicationRepository;
    private final StatusHistoryRepository statusHistoryRepository;

    @Transactional(readOnly = true)
    public List<StatusHistoryResponseDto> getStatusHistoryForApplication(
            final Long userId, final Long applicationId) {
        ensureApplicationExistsForUser(userId, applicationId);
        final List<StatusHistoryResponseDto> history = statusHistoryRepository
                .findAllForApplicationAndUser(applicationId, userId)
                .stream()
                .map(statusHistory -> StatusHistoryResponseDto.from(statusHistory, applicationId))
                .toList();
        log.info(
                "[StatusHistoryService] - GET_STATUS_HISTORY: responseCount: {}, applicationId: {}, userId: {}",
                history.size(),
                applicationId,
                userId);
        return history;
    }

    @Transactional
    public void recordStatusChange(
            final Application application,
            final ApplicationStatus oldStatus,
            final ApplicationStatus newStatus) {
        final StatusHistory statusHistory = StatusHistory.create(application, oldStatus, newStatus);
        final StatusHistory saved = statusHistoryRepository.save(statusHistory);
        log.info(
                "[StatusHistoryService] - RECORD_STATUS_CHANGE: statusHistoryId: {}, applicationId: {}, oldStatus: {}, newStatus: {}",
                saved.getStatusHistoryId(),
                application.getApplicationId(),
                oldStatus,
                newStatus);
    }

    private void ensureApplicationExistsForUser(final Long userId, final Long applicationId) {
        final boolean exists = applicationRepository.existsForUser(applicationId, userId);
        if (!exists) {
            throw new ApplicationNotFoundException(userId, applicationId);
        }
    }
}
