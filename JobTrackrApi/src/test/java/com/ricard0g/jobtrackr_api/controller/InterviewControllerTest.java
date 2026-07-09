package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.Principal;
import java.time.OffsetDateTime;
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

import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewOutcomePatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.InterviewDto.InterviewPutRequestDto;
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

    private static final String USER_ID_VALUE = "11111111-1111-1111-1111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final String BASE_PATH = "/api/v1/applications/10/interviews";
    private static final OffsetDateTime TIMESTAMP = OffsetDateTime.parse("2026-06-10T15:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private InterviewService interviewService;

    @Test
    void getAllInterviews_returns200() throws Exception {
        // given
        final InterviewResponseDto interview = sampleInterview(1L);
        when(interviewService.getAllInterviews(USER_ID, 10L)).thenReturn(List.of(interview));

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].interviewId").value(1))
                .andExpect(jsonPath("$[0].applicationId").value(10))
                .andExpect(jsonPath("$[0].interviewType").value("TECHNICAL"))
                .andExpect(jsonPath("$[0].interviewOutcome").value("PENDING"));
    }

    @Test
    void getAllInterviews_whenUserNotFound_returns404() throws Exception {
        // given
        when(interviewService.getAllInterviews(USER_ID, 10L)).thenThrow(new UserNotFoundException(USER_ID));

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(authenticatedUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void getAllInterviews_whenApplicationNotFound_returns404() throws Exception {
        // given
        when(interviewService.getAllInterviews(USER_ID, 10L))
                .thenThrow(new ApplicationNotFoundException(USER_ID, 10L));

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(authenticatedUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    @Test
    void getAllInterviews_withInvalidApplicationId_returns400() throws Exception {
        // when / then
        mockMvc.perform(get("/api/v1/applications/0/interviews").principal(authenticatedUser()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getInterviewById_returns200() throws Exception {
        // given
        final InterviewResponseDto interview = sampleInterview(2L);
        when(interviewService.getInterviewById(USER_ID, 10L, 2L)).thenReturn(interview);

        // when / then
        mockMvc.perform(get(BASE_PATH + "/2").principal(authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interviewId").value(2))
                .andExpect(jsonPath("$.interviewLocation").value("Zoom"))
                .andExpect(jsonPath("$.interviewNotes").value("System design focus"));
    }

    @Test
    void getInterviewById_whenNotFound_returns404() throws Exception {
        // given
        when(interviewService.getInterviewById(USER_ID, 10L, 99L))
                .thenThrow(new InterviewNotFoundException(USER_ID, 10L, 99L));

        // when / then
        mockMvc.perform(get(BASE_PATH + "/99").principal(authenticatedUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("INTERVIEW_NOT_FOUND"));
    }

    @Test
    void getInterviewById_withInvalidInterviewId_returns400() throws Exception {
        // when / then
        mockMvc.perform(get(BASE_PATH + "/0").principal(authenticatedUser())).andExpect(status().isBadRequest());
    }

    @Test
    void createInterview_withValidBody_returns201() throws Exception {
        // given
        final InterviewResponseDto created = sampleInterview(3L);
        when(interviewService.createInterview(eq(USER_ID), eq(10L), any(InterviewCreateRequestDto.class)))
                .thenReturn(created);

        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
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

        verify(interviewService).createInterview(eq(USER_ID), eq(10L), any(InterviewCreateRequestDto.class));
    }

    @Test
    void createInterview_withMissingInterviewType_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
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
                        post(BASE_PATH).principal(authenticatedUser())
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
                        post(BASE_PATH).principal(authenticatedUser())
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
        when(interviewService.createInterview(eq(USER_ID), eq(10L), any(InterviewCreateRequestDto.class)))
                .thenThrow(new UserNotFoundException(USER_ID));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
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
        when(interviewService.createInterview(eq(USER_ID), eq(10L), any(InterviewCreateRequestDto.class)))
                .thenThrow(new ApplicationNotFoundException(USER_ID, 10L));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
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
    void replaceInterview_withValidBody_returns200() throws Exception {
        // given
        final InterviewResponseDto updated = new InterviewResponseDto(
                2L,
                10L,
                InterviewType.HR,
                TIMESTAMP,
                "Office",
                "Updated notes",
                InterviewOutcome.PASSED,
                TIMESTAMP,
                TIMESTAMP);
        when(interviewService.replaceInterview(eq(USER_ID), eq(10L), eq(2L), any(InterviewPutRequestDto.class)))
                .thenReturn(updated);

        // when / then
        mockMvc.perform(
                        put(BASE_PATH + "/2").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewType": "HR",
                                          "interviewScheduledAt": "2026-06-10T15:00:00Z",
                                          "interviewLocation": "Office",
                                          "interviewNotes": "Updated notes",
                                          "interviewOutcome": "PASSED"
                                        }
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interviewId").value(2))
                .andExpect(jsonPath("$.interviewOutcome").value("PASSED"));

        verify(interviewService).replaceInterview(eq(USER_ID), eq(10L), eq(2L), any(InterviewPutRequestDto.class));
    }

    @Test
    void replaceInterview_withMissingOutcome_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        put(BASE_PATH + "/2").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewType": "TECHNICAL",
                                          "interviewScheduledAt": "2026-06-10T15:00:00Z"
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void replaceInterview_whenNotFound_returns404() throws Exception {
        // given
        when(interviewService.replaceInterview(eq(USER_ID), eq(10L), eq(99L), any(InterviewPutRequestDto.class)))
                .thenThrow(new InterviewNotFoundException(USER_ID, 10L, 99L));

        // when / then
        mockMvc.perform(
                        put(BASE_PATH + "/99").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewType": "TECHNICAL",
                                          "interviewScheduledAt": "2026-06-10T15:00:00Z",
                                          "interviewOutcome": "PENDING"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("INTERVIEW_NOT_FOUND"));
    }

    @Test
    void patchInterviewOutcome_withNewOutcome_returns200() throws Exception {
        // given
        final InterviewResponseDto patched = new InterviewResponseDto(
                2L,
                10L,
                InterviewType.TECHNICAL,
                TIMESTAMP,
                "Zoom",
                "System design focus",
                InterviewOutcome.PASSED,
                TIMESTAMP,
                TIMESTAMP);
        when(interviewService.patchInterviewOutcome(
                eq(USER_ID), eq(10L), eq(2L), any(InterviewOutcomePatchRequestDto.class)))
                .thenReturn(patched);

        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/2/outcome").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewOutcome": "PASSED"
                                        }
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interviewId").value(2))
                .andExpect(jsonPath("$.interviewOutcome").value("PASSED"));

        verify(interviewService)
                .patchInterviewOutcome(eq(USER_ID), eq(10L), eq(2L), any(InterviewOutcomePatchRequestDto.class));
    }

    @Test
    void patchInterviewOutcome_whenNotFound_returns404() throws Exception {
        // given
        when(interviewService.patchInterviewOutcome(
                eq(USER_ID), eq(10L), eq(99L), any(InterviewOutcomePatchRequestDto.class)))
                .thenThrow(new InterviewNotFoundException(USER_ID, 10L, 99L));

        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/99/outcome").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "interviewOutcome": "PASSED"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("INTERVIEW_NOT_FOUND"));
    }

    @Test
    void patchInterviewOutcome_withMissingOutcome_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/2/outcome").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void deleteInterview_returns204() throws Exception {
        // given
        doNothing().when(interviewService).deleteInterview(USER_ID, 10L, 2L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/2").principal(authenticatedUser())).andExpect(status().isNoContent());

        verify(interviewService).deleteInterview(USER_ID, 10L, 2L);
    }

    @Test
    void deleteInterview_whenNotFound_returns404() throws Exception {
        // given
        doThrow(new InterviewNotFoundException(USER_ID, 10L, 99L))
                .when(interviewService)
                .deleteInterview(USER_ID, 10L, 99L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/99").principal(authenticatedUser()))
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

    private static Principal authenticatedUser() {
        return () -> USER_ID_VALUE;
    }
}
