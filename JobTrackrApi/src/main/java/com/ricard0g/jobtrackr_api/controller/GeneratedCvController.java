package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.GeneratedCvDto.GeneratedCvDtos;
import com.ricard0g.jobtrackr_api.exception.InvalidGeneratedCvOrderingException;
import com.ricard0g.jobtrackr_api.service.ApplicationCvService;
import com.ricard0g.jobtrackr_api.service.GeneratedCvListQuery;
import com.ricard0g.jobtrackr_api.util.PreviewHttpHeaders;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Validated
public class GeneratedCvController {

    private static final String DEFAULT_PAGE = "0";
    private static final String DEFAULT_PAGE_SIZE = "10";
    private static final String DEFAULT_SORT = "created";
    private static final String DEFAULT_DIRECTION = "desc";
    private static final int MAX_PAGE_SIZE = 100;

    private final ApplicationCvService applicationCvService;

    @GetMapping("/generated-cvs")
    public ResponseEntity<GeneratedCvDtos.PageResponse> listForUser(
            final Principal principal,
            @RequestParam(defaultValue = DEFAULT_PAGE) @PositiveOrZero final int page,
            @RequestParam(defaultValue = DEFAULT_PAGE_SIZE) @Positive @Max(MAX_PAGE_SIZE)
                    final int size,
            @RequestParam(defaultValue = DEFAULT_SORT) final String sort,
            @RequestParam(defaultValue = DEFAULT_DIRECTION) final String direction) {
        final UUID userId = AuthenticatedUserId.from(principal);
        try {
            final GeneratedCvListQuery query =
                    GeneratedCvListQuery.fromPublicValues(page, size, sort, direction);
            return ResponseEntity.ok(applicationCvService.listForUser(userId, query));
        } catch (final IllegalArgumentException exception) {
            throw new InvalidGeneratedCvOrderingException();
        }
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

    @GetMapping("/generated-cvs/{generatedCvId}/preview")
    public ResponseEntity<byte[]> preview(
            final Principal principal, @PathVariable @Positive final Long generatedCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        final GeneratedCvDtos.Preview preview = applicationCvService.preview(userId, generatedCvId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, PreviewHttpHeaders.CACHE_CONTROL)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        PreviewHttpHeaders.inlineContentDisposition(preview.originalFilename()))
                .contentType(MediaType.parseMediaType(preview.contentType()))
                .body(preview.bytes());
    }

    @DeleteMapping("/generated-cvs/{generatedCvId}")
    public ResponseEntity<Void> delete(
            final Principal principal, @PathVariable @Positive final Long generatedCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        applicationCvService.delete(userId, generatedCvId);
        return ResponseEntity.noContent().build();
    }
}
