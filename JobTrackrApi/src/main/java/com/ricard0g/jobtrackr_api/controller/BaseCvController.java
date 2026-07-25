package com.ricard0g.jobtrackr_api.controller;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvDownloadDto;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvPreviewDto;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvResponseDto;
import com.ricard0g.jobtrackr_api.exception.BaseCvException;
import com.ricard0g.jobtrackr_api.service.BaseCvService;

import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/base-cvs")
@RequiredArgsConstructor
@Validated
public class BaseCvController {

    private static final String PREVIEW_CACHE_CONTROL = "private, no-store";
    private static final String UNSAFE_FILENAME_CHARS = "[\\\\/\"\\r\\n]";

    private final BaseCvService baseCvService;

    @GetMapping
    public ResponseEntity<List<BaseCvResponseDto>> list(final Principal principal) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(baseCvService.list(userId));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<BaseCvResponseDto> upload(
            final Principal principal,
            final MultipartHttpServletRequest multipartRequest,
            @RequestPart("file") final MultipartFile file) {
        final int fileCount = multipartRequest.getMultiFileMap().values().stream()
                .mapToInt(List::size)
                .sum();
        if (fileCount != 1) {
            throw BaseCvException.invalidFormat();
        }
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.status(HttpStatus.CREATED).body(baseCvService.upload(userId, file));
    }

    @GetMapping("/{baseCvId}/download")
    public ResponseEntity<BaseCvDownloadDto> download(
            final Principal principal,
            @PathVariable @Positive final Long baseCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(baseCvService.createDownload(userId, baseCvId));
    }

    @GetMapping("/{baseCvId}/preview")
    public ResponseEntity<byte[]> preview(
            final Principal principal,
            @PathVariable @Positive final Long baseCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        final BaseCvPreviewDto preview = baseCvService.preview(userId, baseCvId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, PREVIEW_CACHE_CONTROL)
                .header(HttpHeaders.CONTENT_DISPOSITION, inlineContentDisposition(preview.originalFilename()))
                .contentType(MediaType.parseMediaType(preview.contentType()))
                .body(preview.bytes());
    }

    @DeleteMapping("/{baseCvId}")
    public ResponseEntity<Void> delete(
            final Principal principal,
            @PathVariable @Positive final Long baseCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        baseCvService.delete(userId, baseCvId);
        return ResponseEntity.noContent().build();
    }

    private static String inlineContentDisposition(final String originalFilename) {
        final String safeFilename = originalFilename.replaceAll(UNSAFE_FILENAME_CHARS, "_");
        final String encodedFilename = URLEncoder.encode(originalFilename, StandardCharsets.UTF_8)
                .replace("+", "%20");
        return "inline; filename=\"" + safeFilename + "\"; filename*=UTF-8''" + encodedFilename;
    }
}
