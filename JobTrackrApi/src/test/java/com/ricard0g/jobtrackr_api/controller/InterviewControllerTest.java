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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewResponseDto;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.exception.InterviewNotFoundException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.enums.InterviewOutcome;
import com.ricard0g.jobtrackr_api.model.enums.InterviewType;
import com.ricard0g.jobtrackr_api.service.InterviewService;

@WebMvcTest(controllers = InterviewController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class InterviewControllerTest {

    private static final String BASE_PATH = "/api/v1/users/1/applications/10/interviews";
    private static final OffsetDateTime TIMESTAMP = OffsetDateTime.parse("2026-06-10T15:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private InterviewService interviewService;

    @Test
    void getAllInterviews_returns200() throws Exception {
        // given
        final InterviewResponseDto interview = sampleInterview(1L);
        when(interviewService.getAllInterviews(1L, 10L)).thenReturn(List.of(interview));

        // when / then
        mockMvc.perform(get(BASE_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].interviewId").value(1))
                .andExpect(jsonPath("$[0].applicationId").value(10))
                .andExpect(jsonPath("$[0].interviewType").value("TECHNICAL"))
                .andExpect(jsonPath("$[0].interviewOutcome").value("PENDING"));
    }

    @Test
    void getAllInterviews_whenUserNotFound_returns404() throws Exception {
        // given
        when(interviewService.getAllInterviews(1L, 10L)).thenThrow(new UserNotFoundException(1L));

        // when / then
        mockMvc.perform(get(BASE_PATH))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void getAllInterviews_whenApplicationNotFound_returns404() throws Exception {
        // given
        when(interviewService.getAllInterviews(1L, 10L)).thenThrow(new ApplicationNotFoundException(1L, 10L));

        // when / then
        mockMvc.perform(get(BASE_PATH))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    @Test
    void getAllInterviews_withInvalidUserId_returns400() throws Exception {
        // when / then
        mockMvc.perform(get("/api/v1/users/0/applications/10/interviews")).andExpect(status().isBadRequest());
    }

    @Test
    void getAllInterviews_withInvalidApplicationId_returns400() throws Exception {
        // when / then
        mockMvc.perform(get("/api/v1/users/1/applications/0/interviews")).andExpect(status().isBadRequest());
    }

    @Test
    void getInterviewById_returns200() throws Exception {
        // given
        final InterviewResponseDto interview = sampleInterview(2L);
        when(interviewService.getInterviewById(1L, 10L, 2L)).thenReturn(interview);

        // when / then
        mockMvc.perform(get(BASE_PATH + "/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interviewId").value(2))
                .andExpect(jsonPath("$.interviewLocation").value("Zoom"))
                .andExpect(jsonPath("$.interviewNotes").value("System design focus"));
    }

    @Test
    void getInterviewById_whenNotFound_returns404() throws Exception {
        // given
        when(interviewService.getInterviewById(1L, 10L, 99L))
                .thenThrow(new InterviewNotFoundException(1L, 10L, 99L));

        // when / then
        mockMvc.perform(get(BASE_PATH + "/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("INTERVIEW_NOT_FOUND"));
    }

    @Test
    void getInterviewById_withInvalidInterviewId_returns400() throws Exception {
        // when / then
        mockMvc.perform(get(BASE_PATH + "/0")).andExpect(status().isBadRequest());
    }

    @Test
    void createInterview_withValidBody_returns201() throws Exception {
        // given
        final InterviewResponseDto created = sampleInterview(3L);
        when(interviewService.createInterview(eq(1L), eq(10L), any(InterviewCreateRequestDto.class)))
                .thenReturn(created);

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewType": "TECHNICAL",
                                          "interviewScheduledAt": "2026-06-10T15:00:00Z",
                                          "interviewLocation": "Zoom",
                                          "interviewNotes": "System design focus"
                                        }
                                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.interviewId").value(3))
                .andExpect(jsonPath("$.applicationId").value(10))
                .andExpect(jsonPath("$.interviewType").value("TECHNICAL"))
                .andExpect(jsonPath("$.interviewOutcome").value("PENDING"));

        verify(interviewService).createInterview(eq(1L), eq(10L), any(InterviewCreateRequestDto.class));
    }

    @Test
    void createInterview_withMissingInterviewType_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewScheduledAt": "2026-06-10T15:00:00Z"
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void createInterview_withMissingInterviewScheduledAt_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewType": "TECHNICAL"
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void createInterview_withLocationTooLong_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewType": "TECHNICAL",
                                          "interviewScheduledAt": "2026-06-10T15:00:00Z",
                                          "interviewLocation": "%s"
                                        }
                                        """
                                                .formatted("x".repeat(256))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("interviewLocation"));
    }

    @Test
    void createInterview_whenUserNotFound_returns404() throws Exception {
        // given
        when(interviewService.createInterview(eq(1L), eq(10L), any(InterviewCreateRequestDto.class)))
                .thenThrow(new UserNotFoundException(1L));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewType": "TECHNICAL",
                                          "interviewScheduledAt": "2026-06-10T15:00:00Z"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void createInterview_whenApplicationNotFound_returns404() throws Exception {
        // given
        when(interviewService.createInterview(eq(1L), eq(10L), any(InterviewCreateRequestDto.class)))
                .thenThrow(new ApplicationNotFoundException(1L, 10L));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewType": "TECHNICAL",
                                          "interviewScheduledAt": "2026-06-10T15:00:00Z"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    @Test
    void deleteInterview_returns204() throws Exception {
        // given
        doNothing().when(interviewService).deleteInterview(1L, 10L, 2L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/2")).andExpect(status().isNoContent());

        verify(interviewService).deleteInterview(1L, 10L, 2L);
    }

    @Test
    void deleteInterview_whenNotFound_returns404() throws Exception {
        // given
        doThrow(new InterviewNotFoundException(1L, 10L, 99L))
                .when(interviewService)
                .deleteInterview(1L, 10L, 99L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("INTERVIEW_NOT_FOUND"));
    }

    private static InterviewResponseDto sampleInterview(final Long interviewId) {
        return new InterviewResponseDto(
                interviewId,
                10L,
                InterviewType.TECHNICAL,
                TIMESTAMP,
                "Zoom",
                "System design focus",
                InterviewOutcome.PENDING,
                TIMESTAMP,
                TIMESTAMP);
    }
}
