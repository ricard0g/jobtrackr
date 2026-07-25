package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.data.domain.Pageable;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.dto.GeneratedCvDto.GeneratedCvDtos;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.service.ApplicationCvService;

@WebMvcTest(controllers = GeneratedCvController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class GeneratedCvControllerTest {

    private static final String USER_ID_VALUE = "11111111-1111-4111-8111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final Long APPLICATION_ID = 3L;
    private static final Long GENERATED_CV_ID = 9L;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ApplicationCvService applicationCvService;

    @Test
    void list_returnsGeneratedCvsForApplication() throws Exception {
        // given
        when(applicationCvService.listForApplication(USER_ID, APPLICATION_ID))
                .thenReturn(List.of(sampleGeneratedCv()));

        // when / then
        mockMvc.perform(get("/api/v1/applications/{applicationId}/generated-cvs", APPLICATION_ID)
                        .principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].generatedCvId").value(GENERATED_CV_ID))
                .andExpect(jsonPath("$[0].applicationId").value(APPLICATION_ID))
                .andExpect(jsonPath("$[0].version").value(2))
                .andExpect(jsonPath("$[0].originalFilename").value("tailored.pdf"))
                .andExpect(jsonPath("$[0].format").value("PDF"))
                .andExpect(jsonPath("$[0].applicationCvId").doesNotExist());
    }

    @Test
    void listForUser_returnsSpringDataPageWithApplicationContext() throws Exception {
        // given
        when(applicationCvService.listForUser(eq(USER_ID), any(Pageable.class)))
                .thenReturn(new GeneratedCvDtos.PageResponse(List.of(sampleSummary()), 21, 0, 20));

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs").principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].generatedCvId").value(GENERATED_CV_ID))
                .andExpect(jsonPath("$.items[0].applicationId").value(APPLICATION_ID))
                .andExpect(jsonPath("$.items[0].applicationTitle").value("Backend Engineer"))
                .andExpect(jsonPath("$.items[0].companyName").value("Acme"))
                .andExpect(jsonPath("$.items[0].version").value(2))
                .andExpect(jsonPath("$.items[0].originalFilename").value("tailored.pdf"))
                .andExpect(jsonPath("$.items[0].format").value("PDF"))
                .andExpect(jsonPath("$.items[0].byteSize").value(2048))
                .andExpect(jsonPath("$.items[0].createdAt").exists())
                .andExpect(jsonPath("$.total").value(21))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20));
        verify(applicationCvService).listForUser(eq(USER_ID), any(Pageable.class));
    }

    @Test
    void listForUser_forwardsPageAndSizeQueryParams() throws Exception {
        // given
        when(applicationCvService.listForUser(eq(USER_ID), any(Pageable.class)))
                .thenReturn(new GeneratedCvDtos.PageResponse(List.of(), 0, 1, 20));

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs")
                        .param("page", "1")
                        .param("size", "20")
                        .principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(20));
        verify(applicationCvService).listForUser(eq(USER_ID), any(Pageable.class));
    }

    @Test
    void download_returnsSignedUri() throws Exception {
        // given
        when(applicationCvService.createDownload(USER_ID, GENERATED_CV_ID))
                .thenReturn(new GeneratedCvDtos.Download("https://signed.example/object?expires=60"));

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs/{generatedCvId}/download", GENERATED_CV_ID)
                        .principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.uri").value("https://signed.example/object?expires=60"));
        verify(applicationCvService).createDownload(USER_ID, GENERATED_CV_ID);
    }

    @Test
    void delete_returnsNoContent() throws Exception {
        // when / then
        mockMvc.perform(delete("/api/v1/generated-cvs/{generatedCvId}", GENERATED_CV_ID).principal(principal()))
                .andExpect(status().isNoContent());
        verify(applicationCvService).delete(USER_ID, GENERATED_CV_ID);
    }

    private GeneratedCvDtos.Response sampleGeneratedCv() {
        return new GeneratedCvDtos.Response(
                GENERATED_CV_ID,
                APPLICATION_ID,
                2,
                "tailored.pdf",
                GeneratedCvFormat.PDF,
                "application/pdf",
                2048L,
                11L,
                OffsetDateTime.parse("2026-07-18T10:00:00Z"));
    }

    private GeneratedCvDtos.Summary sampleSummary() {
        return new GeneratedCvDtos.Summary(
                GENERATED_CV_ID,
                APPLICATION_ID,
                "Backend Engineer",
                "Acme",
                2,
                "tailored.pdf",
                GeneratedCvFormat.PDF,
                "application/pdf",
                2048L,
                11L,
                OffsetDateTime.parse("2026-07-18T10:00:00Z"));
    }

    private Principal principal() {
        return () -> USER_ID_VALUE;
    }
}
