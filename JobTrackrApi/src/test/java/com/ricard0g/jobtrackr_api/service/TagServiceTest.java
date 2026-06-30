package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.exception.DuplicateTagNameException;
import com.ricard0g.jobtrackr_api.exception.TagNotFoundException;
import com.ricard0g.jobtrackr_api.model.Tag;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.TagCategory;
import com.ricard0g.jobtrackr_api.repository.TagRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class TagServiceTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final Long TAG_ID = 1L;

    @Mock
    private TagRepository tagRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private TagService tagService;

    @Test
    void getAllTags_returnsGlobalAndUserTags() {
        // given
        final Tag globalTag = Tag.create(TagCategory.MODALITY, "Remote", "#808080");
        final Tag userTag = Tag.create(sampleUser(), TagCategory.TECH_STACK, "Kotlin", "#AABBCC");
        when(tagRepository.findAllGlobalAndByUserId(USER_ID)).thenReturn(List.of(globalTag, userTag));

        // when
        final List<TagResponseDto> tags = tagService.getAllTags(USER_ID);

        // then
        assertThat(tags).hasSize(2);
        assertThat(tags).extracting(TagResponseDto::global).containsExactlyInAnyOrder(true, false);
    }

    @Test
    void getTagById_whenAccessible_returnsTag() {
        // given
        final Tag tag = Tag.create(TagCategory.TECH_STACK, "Java", "#808080");
        when(tagRepository.findByTagIdAndAccessibleToUser(TAG_ID, USER_ID)).thenReturn(Optional.of(tag));

        // when
        final TagResponseDto response = tagService.getTagById(USER_ID, TAG_ID);

        // then
        assertThat(response.tagName()).isEqualTo("Java");
        assertThat(response.global()).isTrue();
    }

    @Test
    void getTagById_whenNotAccessible_throwsNotFound() {
        // given
        when(tagRepository.findByTagIdAndAccessibleToUser(TAG_ID, USER_ID)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> tagService.getTagById(USER_ID, TAG_ID)).isInstanceOf(TagNotFoundException.class);
    }

    @Test
    void createTag_whenNameAvailable_createsUserOwnedTag() {
        // given
        final User user = sampleUser();
        final CreateTagRequestDto request = new CreateTagRequestDto(TagCategory.TECH_STACK, "Kotlin", "#AABBCC");
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(tagRepository.existsGlobalByTagName("Kotlin")).thenReturn(false);
        when(tagRepository.existsByTagNameAndUser_UserId("Kotlin", USER_ID)).thenReturn(false);
        when(tagRepository.save(any(Tag.class))).thenAnswer(invocation -> {
            final Tag saved = invocation.getArgument(0);
            saved.setTagId(TAG_ID);
            return saved;
        });

        // when
        final TagResponseDto response = tagService.createTag(USER_ID, request);

        // then
        assertThat(response.tagName()).isEqualTo("Kotlin");
        assertThat(response.global()).isFalse();
        verify(tagRepository).save(any(Tag.class));
    }

    @Test
    void createTag_whenGlobalNameExists_throwsDuplicate() {
        // given
        final CreateTagRequestDto request = new CreateTagRequestDto(TagCategory.TECH_STACK, "Java", null);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(sampleUser()));
        when(tagRepository.existsGlobalByTagName("Java")).thenReturn(true);

        // when / then
        assertThatThrownBy(() -> tagService.createTag(USER_ID, request))
                .isInstanceOf(DuplicateTagNameException.class);
        verify(tagRepository, never()).save(any(Tag.class));
    }

    @Test
    void replaceTag_whenGlobalTag_throwsNotFound() {
        // given
        final TagPutRequestDto request = new TagPutRequestDto(TagCategory.TECH_STACK, "Java", "#808080");
        when(tagRepository.findByTagIdAndUser_UserId(TAG_ID, USER_ID)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> tagService.replaceTag(USER_ID, TAG_ID, request))
                .isInstanceOf(TagNotFoundException.class);
    }

    @Test
    void deleteTag_whenGlobalTag_throwsNotFound() {
        // given
        when(tagRepository.findByTagIdAndUser_UserId(TAG_ID, USER_ID)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> tagService.deleteTag(USER_ID, TAG_ID)).isInstanceOf(TagNotFoundException.class);
        verify(tagRepository, never()).delete(any(Tag.class));
    }

    @Test
    void deleteTag_whenUserOwned_deletesTag() {
        // given
        final Tag tag = Tag.create(sampleUser(), TagCategory.TECH_STACK, "Kotlin", "#AABBCC");
        when(tagRepository.findByTagIdAndUser_UserId(TAG_ID, USER_ID)).thenReturn(Optional.of(tag));

        // when
        tagService.deleteTag(USER_ID, TAG_ID);

        // then
        verify(tagRepository).delete(tag);
    }

    private static User sampleUser() {
        return mock(User.class);
    }
}
