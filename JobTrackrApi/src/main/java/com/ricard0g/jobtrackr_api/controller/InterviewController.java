package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewOutcomePatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewResponseDto;
import com.ricard0g.jobtrackr_api.service.InterviewService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/applications/{applicationId}/interviews")
@RequiredArgsConstructor
@Validated
public class InterviewController {

    private final InterviewService interviewService;

    @GetMapping
    public ResponseEntity<List<InterviewResponseDto>> getAllInterviews(
            final Principal principal,
            @PathVariable(name = "applicationId") @Positive final Long applicationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(interviewService.getAllInterviews(userId, applicationId));
    }

    @GetMapping("/{interviewId}")
    public ResponseEntity<InterviewResponseDto> getInterviewById(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @PathVariable @Positive final Long interviewId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(interviewService.getInterviewById(userId, applicationId, interviewId));
    }

    @PostMapping
    public ResponseEntity<InterviewResponseDto> createInterview(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @Valid @RequestBody final InterviewCreateRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(interviewService.createInterview(userId, applicationId, request));
    }

    @PutMapping("/{interviewId}")
    public ResponseEntity<InterviewResponseDto> replaceInterview(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @PathVariable @Positive final Long interviewId,
            @Valid @RequestBody final InterviewPutRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(
                interviewService.replaceInterview(userId, applicationId, interviewId, request));
    }

    @PatchMapping("/{interviewId}/outcome")
    public ResponseEntity<InterviewResponseDto> patchInterviewOutcome(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @PathVariable @Positive final Long interviewId,
            @Valid @RequestBody final InterviewOutcomePatchRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(
                interviewService.patchInterviewOutcome(userId, applicationId, interviewId, request));
    }

    @DeleteMapping("/{interviewId}")
    public ResponseEntity<Void> deleteInterview(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @PathVariable @Positive final Long interviewId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        interviewService.deleteInterview(userId, applicationId, interviewId);
        return ResponseEntity.noContent().build();
    }
}
