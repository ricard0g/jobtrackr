package com.ricard0g.jobtrackr_api.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.StatusHistory;
import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.repository.StatusHistoryRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class StatusHistoryService {

    private final StatusHistoryRepository statusHistoryRepository;

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
}
