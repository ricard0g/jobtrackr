package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.exception.TagNotFoundException;
import com.ricard0g.jobtrackr_api.model.enums.TagCategory;
import com.ricard0g.jobtrackr_api.service.TagService;

@WebMvcTest(controllers = TagController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class TagControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private TagService tagService;

  @Test
  void getAllTags_returns200() throws Exception {
    // given
    final TagResponseDto tag =
        new TagResponseDto(1L, TagCategory.TECH_STACK, "Java", "#FF5733");
    when(tagService.getAllTags()).thenReturn(List.of(tag));

    // when / then
    mockMvc.perform(get("/api/v1/tags"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].tagId").value(1))
        .andExpect(jsonPath("$[0].tagName").value("Java"));
  }

  @Test
  void getTagById_returns200() throws Exception {
    // given
    final TagResponseDto tag =
        new TagResponseDto(1L, TagCategory.TECH_STACK, "Java", "#FF5733");
    when(tagService.getTagById(1L)).thenReturn(tag);

    // when / then
    mockMvc.perform(get("/api/v1/tags/1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.tagId").value(1))
        .andExpect(jsonPath("$.tagCategory").value("TECH_STACK"));
  }

  @Test
  void getTagById_whenNotFound_returns404() throws Exception {
    // given
    when(tagService.getTagById(99L)).thenThrow(new TagNotFoundException(99L));

    // when / then
    mockMvc.perform(get("/api/v1/tags/99")).andExpect(status().isNotFound());
  }

  @Test
  void createTag_withValidBody_returns201() throws Exception {
    // given
    final TagResponseDto created =
        new TagResponseDto(1L, TagCategory.TECH_STACK, "Java", "#FF5733");
    when(tagService.createTag(any(CreateTagRequestDto.class))).thenReturn(created);

    // when / then
    mockMvc.perform(
            post("/api/v1/tags")
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
        .andExpect(jsonPath("$.tagName").value("Java"));
  }

  @Test
  void createTag_withInvalidBody_returns400() throws Exception {
    // when / then
    mockMvc.perform(
            post("/api/v1/tags")
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
  void deleteTag_returns204() throws Exception {
    // given
    doNothing().when(tagService).deleteTag(1L);

    // when / then
    mockMvc.perform(delete("/api/v1/tags/1")).andExpect(status().isNoContent());

    verify(tagService).deleteTag(1L);
  }

  @Test
  void deleteTag_whenNotFound_returns404() throws Exception {
    // given
    doThrow(new TagNotFoundException(99L)).when(tagService).deleteTag(99L);

    // when / then
    mockMvc.perform(delete("/api/v1/tags/99")).andExpect(status().isNotFound());
  }
}
