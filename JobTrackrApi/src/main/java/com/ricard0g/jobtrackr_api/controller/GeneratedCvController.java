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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.GeneratedCvDto.GeneratedCvDtos;
import com.ricard0g.jobtrackr_api.service.ApplicationCvService;

import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Validated
public class GeneratedCvController {

    private final ApplicationCvService applicationCvService;

    @GetMapping("/generated-cvs")
    public ResponseEntity<GeneratedCvDtos.Page> listForUser(
            final Principal principal, @RequestParam(required = false) final String cursor) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationCvService.listForUser(userId, cursor));
    }

    @GetMapping("/applications/{applicationId}/generated-cvs")
    public ResponseEntity<List<GeneratedCvDtos.Response>> list(
            final Principal principal, @PathVariable @Positive final Long applicationId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationCvService.listForApplication(userId, applicationId));
    }

    @GetMapping("/generated-cvs/{generatedCvId}/download")
    public ResponseEntity<GeneratedCvDtos.Download> download(
            final Principal principal, @PathVariable @Positive final Long generatedCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(applicationCvService.createDownload(userId, generatedCvId));
    }

    @DeleteMapping("/generated-cvs/{generatedCvId}")
    public ResponseEntity<Void> delete(
            final Principal principal, @PathVariable @Positive final Long generatedCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        applicationCvService.delete(userId, generatedCvId);
        return ResponseEntity.noContent().build();
    }
}
