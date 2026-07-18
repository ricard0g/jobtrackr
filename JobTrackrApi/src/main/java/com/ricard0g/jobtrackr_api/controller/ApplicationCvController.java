package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.ApplicationCvDto.ApplicationCvDtos;
import com.ricard0g.jobtrackr_api.service.ApplicationCvService;

import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Validated
public class ApplicationCvController {

    private final ApplicationCvService applicationCvService;

    @GetMapping("/applications/{applicationId}/application-cvs")
    public ResponseEntity<List<ApplicationCvDtos.Response>> list(
            final Principal principal, @PathVariable @Positive final Long applicationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationCvService.listForApplication(userId, applicationId));
    }

    @GetMapping("/application-cvs/{applicationCvId}/download")
    public ResponseEntity<ApplicationCvDtos.Download> download(
            final Principal principal, @PathVariable @Positive final Long applicationCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationCvService.createDownload(userId, applicationCvId));
    }

    @DeleteMapping("/application-cvs/{applicationCvId}")
    public ResponseEntity<Void> delete(
            final Principal principal, @PathVariable @Positive final Long applicationCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        applicationCvService.delete(userId, applicationCvId);
        return ResponseEntity.noContent().build();
    }
}
