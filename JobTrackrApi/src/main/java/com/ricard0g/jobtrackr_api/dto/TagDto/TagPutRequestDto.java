package com.ricard0g.jobtrackr_api.dto.TagDto;

import com.ricard0g.jobtrackr_api.model.enums.TagCategory;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record TagPutRequestDto(
        @NotNull TagCategory tagCategory,
        @NotBlank @Size(max = 100) String tagName,
        @Pattern(regexp = CreateTagRequestDto.TAG_COLOR_PATTERN) String tagColor) {}
