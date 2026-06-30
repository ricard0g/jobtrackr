package com.ricard0g.jobtrackr_api.dto.TagDto;

import com.ricard0g.jobtrackr_api.model.Tag;
import com.ricard0g.jobtrackr_api.model.enums.TagCategory;

public record TagResponseDto(
        Long tagId, TagCategory tagCategory, String tagName, String tagColor, boolean global) {

    public static TagResponseDto from(final Tag tag) {
        return new TagResponseDto(
                tag.getTagId(), tag.getTagCategory(), tag.getTagName(), tag.getTagColor(), tag.isGlobal());
    }
}
