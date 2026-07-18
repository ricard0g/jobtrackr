package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

import com.ricard0g.jobtrackr_api.dto.CvGenerationDto.CvGenerationDtos;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.JobDescriptionRepository;
import com.ricard0g.jobtrackr_api.service.CvGenerationService;

@WebMvcTest(controllers = CvGenerationController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class CvGenerationControllerTest {

    private static final String USER_ID_VALUE = "11111111-1111-4111-8111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final UUID CORRELATION_ID = UUID.fromString("22222222-2222-4222-8222-222222222222");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CvGenerationService cvGenerationService;

    @MockitoBean
    private JobDescriptionRepository jobDescriptionRepository;

    @MockitoBean
    private ApplicationRepository applicationRepository;

    @Test
    void create_returnsAcceptedWithoutSensitiveSnapshots() throws Exception {
        when(cvGenerationService.create(eq(USER_ID), eq("idem-1"), any())).thenReturn(sampleResponse());

        mockMvc.perform(post("/api/v1/cv-generations")
                        .principal(principal())
                        .header("Idempotency-Key", "idem-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                                {
                                  "applicationId": 3,
                                  "baseCvId": 7,
                                  "format": "PDF",
                                  "jobDescription": "Build Java APIs with Spring Boot.",
                                  "additionalInformation": "Knows Kubernetes",
                                  "consentAccepted": true
                                }
                                """))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.cvGenerationId").value(11))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.jobDescriptionSnapshot").doesNotExist())
                .andExpect(jsonPath("$.correlationId").value(CORRELATION_ID.toString()));
    }

    @Test
    void create_whenConsentMissing_returnsStableCode() throws Exception {
        when(cvGenerationService.create(eq(USER_ID), eq("idem-2"), any()))
                .thenThrow(CvGenerationException.consentRequired());

        mockMvc.perform(post("/api/v1/cv-generations")
                        .principal(principal())
                        .header("Idempotency-Key", "idem-2")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                                {
                                  "applicationId": 3,
                                  "baseCvId": 7,
                                  "format": "MARKDOWN",
                                  "jobDescription": "Backend role",
                                  "consentAccepted": false
                                }
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("AI_CONSENT_REQUIRED"));
    }

    @Test
    void cancel_returnsUpdatedStatus() throws Exception {
        when(cvGenerationService.cancel(USER_ID, 11L))
                .thenReturn(sampleResponse(CvGenerationStatus.CANCELLED));

        mockMvc.perform(post("/api/v1/cv-generations/11/cancel").principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        verify(cvGenerationService).cancel(USER_ID, 11L);
    }

    @Test
    void list_returnsUserGenerations() throws Exception {
        when(cvGenerationService.listForUser(USER_ID)).thenReturn(List.of(sampleResponse()));

        mockMvc.perform(get("/api/v1/cv-generations").principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].cvGenerationId").value(11));
    }

    private CvGenerationDtos.Response sampleResponse() {
        return sampleResponse(CvGenerationStatus.PENDING);
    }

    private CvGenerationDtos.Response sampleResponse(final CvGenerationStatus status) {
        final OffsetDateTime now = OffsetDateTime.parse("2026-07-18T10:00:00Z");
        return new CvGenerationDtos.Response(
                11L,
                3L,
                7L,
                GeneratedCvFormat.PDF,
                status,
                "idem-1",
                CORRELATION_ID,
                null,
                null,
                null,
                null,
                null,
                now,
                now,
                null,
                null,
                "/api/v1/cv-generations/11");
    }

    private Principal principal() {
        return () -> USER_ID_VALUE;
    }
}
