package com.ricard0g.jobtrackr_api.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationResponseDto;
import com.ricard0g.jobtrackr_api.service.ApplicationService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/users/{userId}/applications")
@RequiredArgsConstructor
@Validated
public class ApplicationController {

    private final ApplicationService applicationService;

    @GetMapping
    public ResponseEntity<List<ApplicationResponseDto>> getAllApplications(
            @PathVariable @Positive final Long userId) {
        return ResponseEntity.ok(applicationService.getAllApplications(userId));
    }

    @GetMapping("/{applicationId}")
    public ResponseEntity<ApplicationResponseDto> getApplicationById(
            @PathVariable @Positive final Long userId, @PathVariable @Positive final Long applicationId) {
        return ResponseEntity.ok(applicationService.getApplicationById(userId, applicationId));
    }

    @PostMapping
    public ResponseEntity<ApplicationResponseDto> createApplication(
            @PathVariable @Positive final Long userId,
            @Valid @RequestBody final ApplicationCreateRequestDto request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(applicationService.createApplication(userId, request));
    }

    @DeleteMapping("/{applicationId}")
    public ResponseEntity<Void> deleteApplication(
            @PathVariable @Positive final Long userId, @PathVariable @Positive final Long applicationId) {
        applicationService.deleteApplication(userId, applicationId);
        return ResponseEntity.noContent().build();
    }
}
