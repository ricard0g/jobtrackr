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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.service.TagService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/tags")
@RequiredArgsConstructor
@Validated
public class TagController {

    private final TagService tagService;

    @GetMapping
    public ResponseEntity<List<TagResponseDto>> getAllTags(final Principal principal) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(tagService.getAllTags(userId));
    }

    @GetMapping("/{tagId}")
    public ResponseEntity<TagResponseDto> getTagById(
            final Principal principal, @PathVariable @Positive final Long tagId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(tagService.getTagById(userId, tagId));
    }

    @PostMapping
    public ResponseEntity<TagResponseDto> createTag(
            final Principal principal, @Valid @RequestBody final CreateTagRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.status(HttpStatus.CREATED).body(tagService.createTag(userId, request));
    }

    @PutMapping("/{tagId}")
    public ResponseEntity<TagResponseDto> replaceTag(
            final Principal principal,
            @PathVariable @Positive final Long tagId,
            @Valid @RequestBody final TagPutRequestDto request) {
        final UUID userId = AuthenticatedUserId.from(principal);
        return ResponseEntity.ok(tagService.replaceTag(userId, tagId, request));
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<Void> deleteTag(final Principal principal, @PathVariable @Positive final Long tagId) {
        final UUID userId = AuthenticatedUserId.from(principal);
        tagService.deleteTag(userId, tagId);
        return ResponseEntity.noContent().build();
    }
}
