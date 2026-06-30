package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationStatusPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationResponseDto;
import com.ricard0g.jobtrackr_api.dto.StatusHistoryDto.StatusHistoryResponseDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.service.ApplicationService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/applications")
@RequiredArgsConstructor
@Validated
public class ApplicationController {

    private final ApplicationService applicationService;

    @GetMapping
    public ResponseEntity<List<ApplicationResponseDto>> getAllApplications(
            final Principal principal) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationService.getAllApplications(userId));
    }

    @GetMapping("/{applicationId}")
    public ResponseEntity<ApplicationResponseDto> getApplicationById(
            final Principal principal, @PathVariable @Positive final Long applicationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationService.getApplicationById(userId, applicationId));
    }

    @PostMapping
    public ResponseEntity<ApplicationResponseDto> createApplication(
            final Principal principal,
            @Valid @RequestBody final ApplicationCreateRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(applicationService.createApplication(userId, request));
    }

    @PutMapping("/{applicationId}")
    public ResponseEntity<ApplicationResponseDto> replaceApplication(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @Valid @RequestBody final ApplicationPutRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationService.replaceApplication(userId, applicationId, request));
    }

    @GetMapping("/{applicationId}/status-history")
    public ResponseEntity<List<StatusHistoryResponseDto>> getStatusHistory(
            final Principal principal, @PathVariable @Positive final Long applicationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationService.getStatusHistory(userId, applicationId));
    }

    @PatchMapping("/{applicationId}/status")
    public ResponseEntity<ApplicationResponseDto> patchApplicationStatus(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @Valid @RequestBody final ApplicationStatusPatchRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationService.patchApplicationStatus(userId, applicationId, request));
    }

    @PatchMapping("/{applicationId}")
    public ResponseEntity<ApplicationResponseDto> patchApplication(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @Valid @RequestBody final ApplicationPatchRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationService.patchApplication(userId, applicationId, request));
    }

    @PostMapping("/{applicationId}/tags")
    public ResponseEntity<TagResponseDto> createAndAttachTag(
            final Principal principal,
            @PathVariable @Positive final Long applicationId,
            @Valid @RequestBody final CreateTagRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(applicationService.createAndAttachTag(userId, applicationId, request));
    }

    @DeleteMapping("/{applicationId}")
    public ResponseEntity<Void> deleteApplication(
            final Principal principal, @PathVariable @Positive final Long applicationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        applicationService.deleteApplication(userId, applicationId);
        return ResponseEntity.noContent().build();
    }
}
