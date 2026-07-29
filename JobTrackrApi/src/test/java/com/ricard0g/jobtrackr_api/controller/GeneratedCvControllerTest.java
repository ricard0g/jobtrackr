package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.dto.GeneratedCvDto.GeneratedCvDtos;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.service.ApplicationCvService;
import com.ricard0g.jobtrackr_api.service.GeneratedCvListQuery;
import com.ricard0g.jobtrackr_api.service.GeneratedCvSortKey;

@WebMvcTest(controllers = GeneratedCvController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class GeneratedCvControllerTest {

    private static final String USER_ID_VALUE = "11111111-1111-4111-8111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final Long APPLICATION_ID = 3L;
    private static final Long GENERATED_CV_ID = 9L;
    private static final int DEFAULT_PAGE_SIZE = 10;

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
        when(applicationCvService.listForUser(eq(USER_ID), any(GeneratedCvListQuery.class)))
                .thenReturn(new GeneratedCvDtos.PageResponse(List.of(sampleSummary()), 21, 0, DEFAULT_PAGE_SIZE));

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
                .andExpect(jsonPath("$.size").value(DEFAULT_PAGE_SIZE));
        verify(applicationCvService).listForUser(eq(USER_ID), any(GeneratedCvListQuery.class));
    }

    @Test
    void listForUser_defaultsToTenItemsPerPage() throws Exception {
        // given
        when(applicationCvService.listForUser(eq(USER_ID), any(GeneratedCvListQuery.class)))
                .thenReturn(new GeneratedCvDtos.PageResponse(List.of(), 0, 0, DEFAULT_PAGE_SIZE));

        // when
        mockMvc.perform(get("/api/v1/generated-cvs").principal(principal())).andExpect(status().isOk());

        // then
        verify(applicationCvService).listForUser(
                USER_ID,
                new GeneratedCvListQuery(
                        0, DEFAULT_PAGE_SIZE, GeneratedCvSortKey.CREATED, Sort.Direction.DESC));
    }

    @Test
    void listForUser_forwardsPageAndSizeQueryParams() throws Exception {
        // given
        when(applicationCvService.listForUser(eq(USER_ID), any(GeneratedCvListQuery.class)))
                .thenReturn(new GeneratedCvDtos.PageResponse(List.of(), 0, 1, DEFAULT_PAGE_SIZE));

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs")
                        .param("page", "1")
                        .param("size", String.valueOf(DEFAULT_PAGE_SIZE))
                        .principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(DEFAULT_PAGE_SIZE));
        verify(applicationCvService).listForUser(
                USER_ID,
                new GeneratedCvListQuery(
                        1, DEFAULT_PAGE_SIZE, GeneratedCvSortKey.CREATED, Sort.Direction.DESC));
    }

    @ParameterizedTest
    @CsvSource({
        "name, asc, NAME, ASC",
        "name, desc, NAME, DESC",
        "type, asc, TYPE, ASC",
        "type, desc, TYPE, DESC",
        "size, asc, SIZE, ASC",
        "size, desc, SIZE, DESC",
        "created, asc, CREATED, ASC",
        "created, desc, CREATED, DESC",
        "version, asc, VERSION, ASC",
        "version, desc, VERSION, DESC",
        "company, asc, COMPANY, ASC",
        "company, desc, COMPANY, DESC"
    })
    void listForUser_acceptsStablePublicSortKeys(
            final String sort,
            final String direction,
            final GeneratedCvSortKey expectedSort,
            final Sort.Direction expectedDirection)
            throws Exception {
        // given
        when(applicationCvService.listForUser(eq(USER_ID), any(GeneratedCvListQuery.class)))
                .thenReturn(new GeneratedCvDtos.PageResponse(List.of(), 0, 2, DEFAULT_PAGE_SIZE));

        // when
        mockMvc.perform(get("/api/v1/generated-cvs")
                        .param("page", "2")
                        .param("size", String.valueOf(DEFAULT_PAGE_SIZE))
                        .param("sort", sort)
                        .param("direction", direction)
                        .principal(principal()))
                .andExpect(status().isOk());

        // then
        verify(applicationCvService).listForUser(
                USER_ID,
                new GeneratedCvListQuery(2, DEFAULT_PAGE_SIZE, expectedSort, expectedDirection));
    }

    @ParameterizedTest
    @CsvSource({"createdAt, desc", "application.company.companyName, asc", "created, sideways"})
    void listForUser_rejectsUnknownSortKeysAndDirections(
            final String sort, final String direction) throws Exception {
        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs")
                        .param("sort", sort)
                        .param("direction", direction)
                        .principal(principal()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GENERATED_CV_ORDERING"));
        verifyNoInteractions(applicationCvService);
    }

    @ParameterizedTest
    @CsvSource({"page, -1", "size, 0", "size, 101"})
    void listForUser_rejectsPageAndSizeBoundaryViolations(
            final String parameter, final String value) throws Exception {
        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs")
                        .param(parameter, value)
                        .principal(principal()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        verifyNoInteractions(applicationCvService);
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

    @Test
    void preview_streamsOwnedPdfInlineWithPrivateNoStoreCaching() throws Exception {
        // given
        final byte[] pdfBytes = "%PDF-1.4 owned generated preview".getBytes(StandardCharsets.UTF_8);
        when(applicationCvService.preview(USER_ID, GENERATED_CV_ID)).thenReturn(
                new GeneratedCvDtos.Preview(pdfBytes, MediaType.APPLICATION_PDF_VALUE, "tailored.pdf"));

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs/{generatedCvId}/preview", GENERATED_CV_ID).principal(principal()))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(content().bytes(pdfBytes))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, no-store"))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"tailored.pdf\"; filename*=UTF-8''tailored.pdf"));
        verify(applicationCvService).preview(USER_ID, GENERATED_CV_ID);
    }

    @Test
    void preview_streamsOwnedMarkdownInlineWithPrivateNoStoreCaching() throws Exception {
        // given
        final byte[] markdownBytes = "# Tailored\n\nSafe preview".getBytes(StandardCharsets.UTF_8);
        when(applicationCvService.preview(USER_ID, GENERATED_CV_ID)).thenReturn(
                new GeneratedCvDtos.Preview(markdownBytes, "text/markdown; charset=UTF-8", "tailored.md"));

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs/{generatedCvId}/preview", GENERATED_CV_ID).principal(principal()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.valueOf("text/markdown")))
                .andExpect(content().bytes(markdownBytes))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, no-store"))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"tailored.md\"; filename*=UTF-8''tailored.md"));
        verify(applicationCvService).preview(USER_ID, GENERATED_CV_ID);
    }

    @Test
    void preview_streamsConvertedDocxPdfInlineWithPrivateNoStoreCaching() throws Exception {
        // given
        final byte[] pdfBytes = "%PDF-1.4 converted generated docx".getBytes(StandardCharsets.UTF_8);
        when(applicationCvService.preview(USER_ID, GENERATED_CV_ID)).thenReturn(
                new GeneratedCvDtos.Preview(pdfBytes, MediaType.APPLICATION_PDF_VALUE, "tailored.pdf"));

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs/{generatedCvId}/preview", GENERATED_CV_ID).principal(principal()))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(content().bytes(pdfBytes))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, no-store"))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"tailored.pdf\"; filename*=UTF-8''tailored.pdf"));
        verify(applicationCvService).preview(USER_ID, GENERATED_CV_ID);
    }

    @Test
    void preview_whenNotOwned_returnsNotFoundWithoutLeakingStorage() throws Exception {
        // given
        when(applicationCvService.preview(USER_ID, GENERATED_CV_ID))
                .thenThrow(CvGenerationException.generatedCvNotFound());

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs/{generatedCvId}/preview", GENERATED_CV_ID).principal(principal()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("GENERATED_CV_NOT_FOUND"));
    }

    @Test
    void preview_whenStorageUnavailable_returnsPreviewFailure() throws Exception {
        // given
        when(applicationCvService.preview(USER_ID, GENERATED_CV_ID))
                .thenThrow(CvGenerationException.previewUnavailable());

        // when / then
        mockMvc.perform(get("/api/v1/generated-cvs/{generatedCvId}/preview", GENERATED_CV_ID).principal(principal()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("GENERATED_CV_PREVIEW_UNAVAILABLE"));
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
