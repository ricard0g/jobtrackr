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

import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
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
    public ResponseEntity<List<TagResponseDto>> getAllTags() {
        return ResponseEntity.ok(tagService.getAllTags());
    }

    @GetMapping("/{tagId}")
    public ResponseEntity<TagResponseDto> getTagById(@PathVariable @Positive final Long tagId) {
        return ResponseEntity.ok(tagService.getTagById(tagId));
    }

    @PostMapping
    public ResponseEntity<TagResponseDto> createTag(@Valid @RequestBody final CreateTagRequestDto request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(tagService.createTag(request));
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<Void> deleteTag(@PathVariable @Positive final Long tagId) {
        tagService.deleteTag(tagId);
        return ResponseEntity.noContent().build();
    }
}
