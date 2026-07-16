package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvDownloadDto;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvResponseDto;
import com.ricard0g.jobtrackr_api.exception.BaseCvException;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;
import com.ricard0g.jobtrackr_api.service.BaseCvService;

@WebMvcTest(controllers = BaseCvController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class BaseCvControllerTest {

    private static final String USER_ID_VALUE = "11111111-1111-4111-8111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final String BASE_PATH = "/api/v1/base-cvs";
    private static final Long BASE_CV_ID = 7L;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BaseCvService baseCvService;

    @Test
    void list_returnsMetadataWithoutInternalStorageFields() throws Exception {
        // given
        when(baseCvService.list(USER_ID)).thenReturn(List.of(sampleBaseCv()));

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].baseCvId").value(BASE_CV_ID))
                .andExpect(jsonPath("$[0].originalFilename").value("cv.pdf"))
                .andExpect(jsonPath("$[0].format").value("PDF"))
                .andExpect(jsonPath("$[0].objectKey").doesNotExist())
                .andExpect(jsonPath("$[0].sha256").doesNotExist());
    }

    @Test
    void upload_returnsCreatedDocument() throws Exception {
        // given
        final MockMultipartFile file = new MockMultipartFile(
                "file", "cv.pdf", "application/pdf", "%PDF valid content".getBytes(StandardCharsets.UTF_8));
        when(baseCvService.upload(any(), any())).thenReturn(sampleBaseCv());

        // when / then
        mockMvc.perform(multipart(BASE_PATH).file(file).principal(principal()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.baseCvId").value(BASE_CV_ID));
    }

    @Test
    void upload_whenValidationFails_returnsStableErrorCode() throws Exception {
        // given
        final MockMultipartFile file = new MockMultipartFile(
                "file", "cv.exe", "application/octet-stream", "invalid".getBytes(StandardCharsets.UTF_8));
        when(baseCvService.upload(any(), any())).thenThrow(BaseCvException.invalidFormat());

        // when / then
        mockMvc.perform(multipart(BASE_PATH).file(file).principal(principal()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_BASE_CV_FORMAT"));
    }

    @Test
    void upload_withMoreThanOneFile_rejectsRequest() throws Exception {
        // given
        final MockMultipartFile first = new MockMultipartFile(
                "file", "one.md", "text/markdown", "First meaningful CV".getBytes(StandardCharsets.UTF_8));
        final MockMultipartFile second = new MockMultipartFile(
                "file", "two.md", "text/markdown", "Second meaningful CV".getBytes(StandardCharsets.UTF_8));

        // when / then
        mockMvc.perform(multipart(BASE_PATH).file(first).file(second).principal(principal()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_BASE_CV_FORMAT"));
        verify(baseCvService, never()).upload(any(), any());
    }

    @Test
    void download_returnsSignedUri() throws Exception {
        // given
        final URI signedUri = URI.create("https://signed.example/object?expires=60");
        when(baseCvService.createDownload(USER_ID, BASE_CV_ID)).thenReturn(new BaseCvDownloadDto(signedUri));

        // when / then
        mockMvc.perform(get(BASE_PATH + "/{baseCvId}/download", BASE_CV_ID).principal(principal()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.uri").value(signedUri.toASCIIString()));
    }

    @Test
    void delete_returnsNoContent() throws Exception {
        // when / then
        mockMvc.perform(delete(BASE_PATH + "/{baseCvId}", BASE_CV_ID).principal(principal()))
                .andExpect(status().isNoContent());
        verify(baseCvService).delete(USER_ID, BASE_CV_ID);
    }

    private BaseCvResponseDto sampleBaseCv() {
        return new BaseCvResponseDto(
                BASE_CV_ID,
                "cv.pdf",
                BaseCvFormat.PDF,
                "application/pdf",
                1024,
                OffsetDateTime.parse("2026-07-16T12:00:00Z"));
    }

    private Principal principal() {
        return () -> USER_ID_VALUE;
    }
}
