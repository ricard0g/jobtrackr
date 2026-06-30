package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.exception.DuplicateTagNameException;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.exception.TagNotFoundException;
import com.ricard0g.jobtrackr_api.model.enums.TagCategory;
import com.ricard0g.jobtrackr_api.service.TagService;

@WebMvcTest(controllers = TagController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class TagControllerTest {

    private static final String USER_ID_VALUE = "11111111-1111-1111-1111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TagService tagService;

    @Test
    void getAllTags_returns200() throws Exception {
        // given
        final TagResponseDto tag = new TagResponseDto(1L, TagCategory.TECH_STACK, "Java", "#FF5733", true);
        when(tagService.getAllTags(USER_ID)).thenReturn(List.of(tag));

        // when / then
        mockMvc.perform(get("/api/v1/tags").principal(authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].tagId").value(1))
                .andExpect(jsonPath("$[0].tagName").value("Java"))
                .andExpect(jsonPath("$[0].global").value(true));
    }

    @Test
    void getTagById_returns200() throws Exception {
        // given
        final TagResponseDto tag = new TagResponseDto(1L, TagCategory.TECH_STACK, "Java", "#FF5733", true);
        when(tagService.getTagById(USER_ID, 1L)).thenReturn(tag);

        // when / then
        mockMvc.perform(get("/api/v1/tags/1").principal(authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tagId").value(1))
                .andExpect(jsonPath("$.tagCategory").value("TECH_STACK"));
    }

    @Test
    void getTagById_whenNotFound_returns404() throws Exception {
        // given
        when(tagService.getTagById(USER_ID, 99L)).thenThrow(new TagNotFoundException(99L));

        // when / then
        mockMvc.perform(get("/api/v1/tags/99").principal(authenticatedUser())).andExpect(status().isNotFound());
    }

    @Test
    void createTag_withValidBody_returns201() throws Exception {
        // given
        final TagResponseDto created = new TagResponseDto(1L, TagCategory.TECH_STACK, "Java", "#FF5733", false);
        when(tagService.createTag(eq(USER_ID), any(CreateTagRequestDto.class))).thenReturn(created);

        // when / then
        mockMvc.perform(
                        post("/api/v1/tags")
                                .principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "tagCategory": "TECH_STACK",
                                          "tagName": "Java",
                                          "tagColor": "#FF5733"
                                        }
                                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tagId").value(1))
                .andExpect(jsonPath("$.tagName").value("Java"))
                .andExpect(jsonPath("$.global").value(false));
    }

    @Test
    void createTag_withInvalidBody_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post("/api/v1/tags")
                                .principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "tagCategory": "TECH_STACK",
                                          "tagName": ""
                                        }
                                        """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void replaceTag_withValidBody_returns200() throws Exception {
        // given
        final TagResponseDto updated = new TagResponseDto(1L, TagCategory.TECH_STACK, "Java 21", "#112233", false);
        when(tagService.replaceTag(eq(USER_ID), eq(1L), any(TagPutRequestDto.class))).thenReturn(updated);

        // when / then
        mockMvc.perform(
                        put("/api/v1/tags/1")
                                .principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "tagCategory": "TECH_STACK",
                                          "tagName": "Java 21",
                                          "tagColor": "#112233"
                                        }
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tagId").value(1))
                .andExpect(jsonPath("$.tagName").value("Java 21"));

        verify(tagService).replaceTag(eq(USER_ID), eq(1L), any(TagPutRequestDto.class));
    }

    @Test
    void replaceTag_whenNotFound_returns404() throws Exception {
        // given
        when(tagService.replaceTag(eq(USER_ID), eq(99L), any(TagPutRequestDto.class)))
                .thenThrow(new TagNotFoundException(99L));

        // when / then
        mockMvc.perform(
                        put("/api/v1/tags/99")
                                .principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "tagCategory": "TECH_STACK",
                                          "tagName": "Java"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TAG_NOT_FOUND"));
    }

    @Test
    void replaceTag_whenDuplicateName_returns409() throws Exception {
        // given
        when(tagService.replaceTag(eq(USER_ID), eq(1L), any(TagPutRequestDto.class)))
                .thenThrow(new DuplicateTagNameException("Spring"));

        // when / then
        mockMvc.perform(
                        put("/api/v1/tags/1")
                                .principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "tagCategory": "TECH_STACK",
                                          "tagName": "Spring"
                                        }
                                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_TAG_NAME"));
    }

    @Test
    void deleteTag_returns204() throws Exception {
        // given
        doNothing().when(tagService).deleteTag(USER_ID, 1L);

        // when / then
        mockMvc.perform(delete("/api/v1/tags/1").principal(authenticatedUser())).andExpect(status().isNoContent());

        verify(tagService).deleteTag(USER_ID, 1L);
    }

    @Test
    void deleteTag_whenNotFound_returns404() throws Exception {
        // given
        doThrow(new TagNotFoundException(99L)).when(tagService).deleteTag(USER_ID, 99L);

        // when / then
        mockMvc.perform(delete("/api/v1/tags/99").principal(authenticatedUser())).andExpect(status().isNotFound());
    }

    private static Principal authenticatedUser() {
        return () -> USER_ID_VALUE;
    }
}
