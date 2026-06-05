package com.ricard0g.jobtrackr_api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewResponseDto;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.exception.InterviewNotFoundException;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.Interview;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.InterviewRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class InterviewService {

    private final ApplicationRepository applicationRepository;
    private final InterviewRepository interviewRepository;

    @Transactional(readOnly = true)
    public List<InterviewResponseDto> getAllInterviews(final Long userId, final Long applicationId) {
        ensureApplicationExistsForUser(userId, applicationId);
        final List<InterviewResponseDto> interviews = interviewRepository
                .findAllForApplicationAndUser(applicationId, userId)
                .stream()
                .map(interview -> InterviewResponseDto.from(interview, applicationId))
                .toList();
        log.info(
                "[InterviewService] - GET_ALL_INTERVIEWS: responseCount: {}, applicationId: {}, userId: {}",
                interviews.size(),
                applicationId,
                userId);
        return interviews;
    }

    @Transactional(readOnly = true)
    public InterviewResponseDto getInterviewById(
            final Long userId, final Long applicationId, final Long interviewId) {
        final Interview interview = requireInterviewForUser(userId, applicationId, interviewId);
        log.info(
                "[InterviewService] - GET_INTERVIEW_BY_ID: interviewId: {}, applicationId: {}, userId: {}",
                interviewId,
                applicationId,
                userId);
        return InterviewResponseDto.from(interview, applicationId);
    }

    @Transactional
    public InterviewResponseDto createInterview(
            final Long userId, final Long applicationId, final InterviewCreateRequestDto dto) {
        ensureApplicationExistsForUser(userId, applicationId);
        final Application application = applicationRepository.getReferenceById(applicationId);
        final Interview interview = Interview.create(
                application,
                dto.interviewType(),
                dto.interviewScheduledAt(),
                normalizeOptional(dto.interviewLocation()),
                normalizeOptional(dto.interviewNotes()));
        final Interview saved = interviewRepository.save(interview);
        log.info(
                "[InterviewService] - CREATE_INTERVIEW: interviewId: {}, applicationId: {}, userId: {}",
                saved.getInterviewId(),
                applicationId,
                userId);
        return InterviewResponseDto.from(saved, applicationId);
    }

    @Transactional
    public void deleteInterview(final Long userId, final Long applicationId, final Long interviewId) {
        final Interview interview = requireInterviewForUser(userId, applicationId, interviewId);
        interviewRepository.delete(interview);
        log.info(
                "[InterviewService] - DELETE_INTERVIEW: interviewId: {}, applicationId: {}, userId: {}",
                interviewId,
                applicationId,
                userId);
    }

    private void ensureApplicationExistsForUser(final Long userId, final Long applicationId) {
        final boolean applicationExists = applicationRepository.existsForUser(applicationId, userId);
        if (!applicationExists) {
            throw new ApplicationNotFoundException(userId, applicationId);
        }
    }

    private Interview requireInterviewForUser(
            final Long userId, final Long applicationId, final Long interviewId) {
        return interviewRepository
                .findForApplicationAndUser(interviewId, applicationId, userId)
                .orElseThrow(() -> new InterviewNotFoundException(userId, applicationId, interviewId));
    }

    private String normalizeOptional(final String value) {
        if (value == null) {
            return null;
        }
        final String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
