package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.dto.StatusHistoryDto.StatusHistoryResponseDto;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.model.StatusHistory;
import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.StatusHistoryRepository;

@ExtendWith(MockitoExtension.class)
class StatusHistoryServiceTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final Long APPLICATION_ID = 2L;
    private static final OffsetDateTime NEWER_TIMESTAMP = OffsetDateTime.parse("2026-06-10T15:00:00Z");
    private static final OffsetDateTime OLDER_TIMESTAMP = OffsetDateTime.parse("2026-06-09T10:00:00Z");

    @Mock
    private ApplicationRepository applicationRepository;

    @Mock
    private StatusHistoryRepository statusHistoryRepository;

    @InjectMocks
    private StatusHistoryService statusHistoryService;

    @Test
    void getStatusHistoryForApplication_returnsMappedDtos() {
        // given
        when(applicationRepository.existsForUser(APPLICATION_ID, USER_ID)).thenReturn(true);
        final List<StatusHistory> history = List.of(
                sampleStatusHistory(2L, ApplicationStatus.IN_REVIEW, ApplicationStatus.OFFER, NEWER_TIMESTAMP),
                sampleStatusHistory(1L, ApplicationStatus.APPLIED, ApplicationStatus.IN_REVIEW, OLDER_TIMESTAMP));
        when(statusHistoryRepository.findAllForApplicationAndUser(APPLICATION_ID, USER_ID)).thenReturn(history);

        // when
        final List<StatusHistoryResponseDto> result =
                statusHistoryService.getStatusHistoryForApplication(USER_ID, APPLICATION_ID);

        // then
        assertThat(result).hasSize(2);
        assertThat(result.get(0).statusHistoryId()).isEqualTo(2L);
        assertThat(result.get(0).statusHistoryNewStatus()).isEqualTo(ApplicationStatus.OFFER);
        assertThat(result.get(1).statusHistoryId()).isEqualTo(1L);
        verify(statusHistoryRepository).findAllForApplicationAndUser(APPLICATION_ID, USER_ID);
    }

    @Test
    void getStatusHistoryForApplication_whenApplicationNotFound_throws() {
        // given
        when(applicationRepository.existsForUser(APPLICATION_ID, USER_ID)).thenReturn(false);

        // when / then
        assertThatThrownBy(() -> statusHistoryService.getStatusHistoryForApplication(USER_ID, APPLICATION_ID))
                .isInstanceOf(ApplicationNotFoundException.class);
    }

    @Test
    void getStatusHistoryForApplication_whenNoHistory_returnsEmptyList() {
        // given
        when(applicationRepository.existsForUser(APPLICATION_ID, USER_ID)).thenReturn(true);
        when(statusHistoryRepository.findAllForApplicationAndUser(APPLICATION_ID, USER_ID))
                .thenReturn(List.of());

        // when
        final List<StatusHistoryResponseDto> result =
                statusHistoryService.getStatusHistoryForApplication(USER_ID, APPLICATION_ID);

        // then
        assertThat(result).isEmpty();
    }

    private static StatusHistory sampleStatusHistory(
            final Long statusHistoryId,
            final ApplicationStatus oldStatus,
            final ApplicationStatus newStatus,
            final OffsetDateTime changedAt) {
        final StatusHistory statusHistory = mock(StatusHistory.class);
        when(statusHistory.getStatusHistoryId()).thenReturn(statusHistoryId);
        when(statusHistory.getStatusHistoryOldStatus()).thenReturn(oldStatus);
        when(statusHistory.getStatusHistoryNewStatus()).thenReturn(newStatus);
        when(statusHistory.getStatusHistoryChangedAt()).thenReturn(changedAt);
        when(statusHistory.getStatusHistoryCreatedAt()).thenReturn(changedAt);
        return statusHistory;
    }
}
