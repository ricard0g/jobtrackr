package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.CvGenerationDto.CvGenerationDtos;
import com.ricard0g.jobtrackr_api.dto.CvGenerationDto.JobDescriptionResponseDto;
import com.ricard0g.jobtrackr_api.service.CvGenerationService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Validated
public class CvGenerationController {

    private final CvGenerationService cvGenerationService;

    @PostMapping("/cv-generations")
    public ResponseEntity<CvGenerationDtos.Response> create(
            final Principal principal,
            @RequestHeader(value = "Idempotency-Key", required = false) final String idempotencyKey,
            @Valid @RequestBody final CvGenerationDtos.CreateRequest request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(cvGenerationService.create(userId, idempotencyKey, request));
    }

    @GetMapping("/cv-generations")
    public ResponseEntity<List<CvGenerationDtos.Response>> list(
            final Principal principal,
            @RequestParam(required = false) @Positive final Long applicationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        if (applicationId != null) {
            return ResponseEntity.ok(cvGenerationService.listForApplication(userId, applicationId));
        }
        return ResponseEntity.ok(cvGenerationService.listForUser(userId));
    }

    @GetMapping("/cv-generations/{cvGenerationId}")
    public ResponseEntity<CvGenerationDtos.Response> get(
            final Principal principal, @PathVariable @Positive final Long cvGenerationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(cvGenerationService.get(userId, cvGenerationId));
    }

    @PostMapping("/cv-generations/{cvGenerationId}/cancel")
    public ResponseEntity<CvGenerationDtos.Response> cancel(
            final Principal principal, @PathVariable @Positive final Long cvGenerationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(cvGenerationService.cancel(userId, cvGenerationId));
    }

    @GetMapping("/ai-consent")
    public ResponseEntity<CvGenerationDtos.ConsentResponse> getConsent(final Principal principal) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(cvGenerationService.getConsent(userId));
    }

    @PostMapping("/ai-consent")
    public ResponseEntity<CvGenerationDtos.ConsentResponse> recordConsent(
            final Principal principal, @Valid @RequestBody final CvGenerationDtos.ConsentRequest request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(cvGenerationService.recordConsent(userId, request.accepted()));
    }

    @GetMapping("/applications/{applicationId}/job-description")
    public ResponseEntity<JobDescriptionResponseDto> getJobDescription(
            final Principal principal, @PathVariable @Positive final Long applicationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(cvGenerationService.getJobDescription(userId, applicationId));
    }
}
