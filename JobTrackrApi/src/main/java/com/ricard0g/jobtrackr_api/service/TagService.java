package com.ricard0g.jobtrackr_api.service;

import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.exception.DuplicateTagNameException;
import com.ricard0g.jobtrackr_api.exception.TagNotFoundException;
import com.ricard0g.jobtrackr_api.model.Tag;
import com.ricard0g.jobtrackr_api.repository.TagRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class TagService {

    private final TagRepository tagRepository;

    @Transactional(readOnly = true)
    public List<TagResponseDto> getAllTags() {
        final List<TagResponseDto> tags = tagRepository.findAll().stream()
                .sorted(Comparator.comparing(Tag::getTagName))
                .map(TagResponseDto::from)
                .toList();
        log.info("[TagService] - GET_ALL_TAGS: responseCount: {}", tags.size());
        return tags;
    }

    @Transactional(readOnly = true)
    public TagResponseDto getTagById(final Long tagId) {
        final Tag tag = tagRepository.findById(tagId).orElseThrow(() -> new TagNotFoundException(tagId));
        log.info("[TagService] - GET_TAG_BY_ID: response: {}, tagId: {}", tag.getTagName(), tagId);
        return TagResponseDto.from(tag);
    }

    @Transactional
    public TagResponseDto createTag(final CreateTagRequestDto request) {
        if (tagRepository.existsByTagName(request.tagName())) {
            throw new DuplicateTagNameException(request.tagName());
        }
        final Tag tag = Tag.create(request.tagCategory(), request.tagName(), request.tagColor());
        final Tag savedTag = tagRepository.save(tag);
        final TagResponseDto response = TagResponseDto.from(savedTag);
        log.info("[TagService] - CREATE_TAG: response: {}, tagId: {}", response.tagName(), response.tagId());
        return response;
    }

    @Transactional
    public void deleteTag(final Long tagId) {
        final Tag tag = tagRepository.findById(tagId).orElseThrow(() -> new TagNotFoundException(tagId));
        tagRepository.delete(tag);
        log.info("[TagService] - DELETE_TAG: tagId: {}", tagId);
    }
}
