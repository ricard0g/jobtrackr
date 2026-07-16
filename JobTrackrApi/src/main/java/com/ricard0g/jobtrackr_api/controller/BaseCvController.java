package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

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

    @DeleteMapping("/{baseCvId}")
    public ResponseEntity<Void> delete(
            final Principal principal,
            @PathVariable @Positive final Long baseCvId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        baseCvService.delete(userId, baseCvId);
        return ResponseEntity.noContent().build();
    }
}
