package com.ricard0g.jobtrackr_api.service;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.exception.DuplicateTagNameException;
import com.ricard0g.jobtrackr_api.exception.TagNotFoundException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.Tag;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.TagRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class TagService {

    private final TagRepository tagRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<TagResponseDto> getAllTags(final UUID userId) {
        final List<TagResponseDto> tags = tagRepository.findAllGlobalAndByUserId(userId).stream()
                .sorted(Comparator.comparing(Tag::getTagName))
                .map(TagResponseDto::from)
                .toList();
        log.info("[TagService] - GET_ALL_TAGS: responseCount: {}, userId: {}", tags.size(), userId);
        return tags;
    }

    @Transactional(readOnly = true)
    public TagResponseDto getTagById(final UUID userId, final Long tagId) {
        final Tag tag = requireAccessibleTag(userId, tagId);
        log.info("[TagService] - GET_TAG_BY_ID: response: {}, tagId: {}, userId: {}", tag.getTagName(), tagId, userId);
        return TagResponseDto.from(tag);
    }

    @Transactional
    public TagResponseDto createTag(final UUID userId, final CreateTagRequestDto request) {
        final User user = requireUser(userId);
        ensureTagNameAvailable(userId, request.tagName());
        final Tag tag = Tag.create(user, request.tagCategory(), request.tagName(), request.tagColor());
        final Tag savedTag = tagRepository.save(tag);
        final TagResponseDto response = TagResponseDto.from(savedTag);
        log.info(
                "[TagService] - CREATE_TAG: response: {}, tagId: {}, userId: {}",
                response.tagName(),
                response.tagId(),
                userId);
        return response;
    }

    @Transactional
    public TagResponseDto replaceTag(final UUID userId, final Long tagId, final TagPutRequestDto request) {
        final Tag tag = requireOwnedTag(userId, tagId);
        ensureTagNameAvailableForReplace(userId, request.tagName(), tagId);
        tag.setTagCategory(request.tagCategory());
        tag.setTagName(request.tagName());
        final boolean hasColor = request.tagColor() != null && !request.tagColor().isBlank();
        tag.setTagColor(hasColor ? request.tagColor() : Tag.DEFAULT_TAG_COLOR);
        final Tag savedTag = tagRepository.save(tag);
        final TagResponseDto response = TagResponseDto.from(savedTag);
        log.info(
                "[TagService] - REPLACE_TAG: response: {}, tagId: {}, userId: {}",
                response.tagName(),
                response.tagId(),
                userId);
        return response;
    }

    @Transactional
    public void deleteTag(final UUID userId, final Long tagId) {
        final Tag tag = requireOwnedTag(userId, tagId);
        tagRepository.delete(tag);
        log.info("[TagService] - DELETE_TAG: tagId: {}, userId: {}", tagId, userId);
    }

    private User requireUser(final UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException(userId));
    }

    private Tag requireAccessibleTag(final UUID userId, final Long tagId) {
        return tagRepository
                .findByTagIdAndAccessibleToUser(tagId, userId)
                .orElseThrow(() -> new TagNotFoundException(tagId));
    }

    private Tag requireOwnedTag(final UUID userId, final Long tagId) {
        return tagRepository
                .findByTagIdAndUser_UserId(tagId, userId)
                .orElseThrow(() -> new TagNotFoundException(tagId));
    }

    private void ensureTagNameAvailable(final UUID userId, final String tagName) {
        final boolean nameTaken =
                tagRepository.existsGlobalByTagName(tagName) || tagRepository.existsByTagNameAndUser_UserId(tagName, userId);
        if (nameTaken) {
            throw new DuplicateTagNameException(tagName);
        }
    }

    private void ensureTagNameAvailableForReplace(final UUID userId, final String tagName, final Long tagId) {
        final boolean globalConflict = tagRepository.existsGlobalByTagNameAndTagIdNot(tagName, tagId);
        final boolean userConflict =
                tagRepository.existsByTagNameAndUser_UserIdAndTagIdNot(tagName, userId, tagId);
        if (globalConflict || userConflict) {
            throw new DuplicateTagNameException(tagName);
        }
    }
}
