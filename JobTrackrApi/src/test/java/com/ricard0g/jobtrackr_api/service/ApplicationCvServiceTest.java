package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.timeout;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.conversion.GotenbergClient;
import com.ricard0g.jobtrackr_api.dto.GeneratedCvDto.GeneratedCvDtos;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.exception.DocumentConversionException;
import com.ricard0g.jobtrackr_api.exception.StorageUnavailableException;
import com.ricard0g.jobtrackr_api.model.ApplicationCv;
import com.ricard0g.jobtrackr_api.model.StorageCleanupJob;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.repository.ApplicationCvRepository;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.StorageCleanupJobRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.storage.ObjectStorage;

@ExtendWith(MockitoExtension.class)
class ApplicationCvServiceTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final Long GENERATED_CV_ID = 9L;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ApplicationRepository applicationRepository;

    @Mock
    private ApplicationCvRepository applicationCvRepository;

    @Mock
    private StorageCleanupJobRepository storageCleanupJobRepository;

    @Mock
    private ObjectStorage objectStorage;

    @Mock
    private CvGenerationProperties properties;

    @Mock
    private GotenbergClient gotenbergClient;

    @InjectMocks
    private ApplicationCvService service;

    @Test
    void preview_streamsOwnedPdfWithoutCreatingPreviewCacheCopy() {
        // given
        final ApplicationCv generatedCv = mockGeneratedCv(GeneratedCvFormat.PDF, "tailored.pdf", "application/pdf");
        final byte[] pdfBytes = "%PDF-1.4 generated".getBytes(StandardCharsets.UTF_8);
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.download("opaque-key")).thenReturn(pdfBytes);

        // when
        final GeneratedCvDtos.Preview preview = service.preview(USER_ID, GENERATED_CV_ID);

        // then
        assertThat(preview.bytes()).isEqualTo(pdfBytes);
        assertThat(preview.contentType()).isEqualTo("application/pdf");
        assertThat(preview.originalFilename()).isEqualTo("tailored.pdf");
        verify(objectStorage, never()).exists(any());
        verify(objectStorage, never()).upload(any(), any(), any());
        verify(gotenbergClient, never()).convertDocxToPdf(any(), any());
    }

    @Test
    void preview_streamsOwnedMarkdownAsUtf8TextMarkdown() {
        // given
        final ApplicationCv generatedCv = mockGeneratedCv(GeneratedCvFormat.MARKDOWN, "tailored.md", "text/markdown");
        final byte[] markdownBytes = "# Tailored CV\n\n- Java".getBytes(StandardCharsets.UTF_8);
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.download("opaque-key")).thenReturn(markdownBytes);

        // when
        final GeneratedCvDtos.Preview preview = service.preview(USER_ID, GENERATED_CV_ID);

        // then
        assertThat(preview.bytes()).isEqualTo(markdownBytes);
        assertThat(preview.contentType()).isEqualTo("text/markdown; charset=UTF-8");
        assertThat(preview.originalFilename()).isEqualTo("tailored.md");
        verify(objectStorage, never()).exists(any());
        verify(objectStorage, never()).upload(any(), any(), any());
    }

    @Test
    void preview_whenDocxCacheMiss_convertsUploadsAndStreamsPdf() {
        // given
        final ApplicationCv generatedCv = docxGeneratedCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 preview".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.exists(previewKey)).thenReturn(false);
        when(objectStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "tailored.docx")).thenReturn(pdfBytes);

        // when
        final GeneratedCvDtos.Preview preview = service.preview(USER_ID, GENERATED_CV_ID);

        // then
        assertThat(preview.bytes()).isEqualTo(pdfBytes);
        assertThat(preview.contentType()).isEqualTo("application/pdf");
        assertThat(preview.originalFilename()).isEqualTo("tailored.pdf");
        verify(objectStorage).upload(previewKey, pdfBytes, "application/pdf");
    }

    @Test
    void preview_whenDocxCacheHit_streamsCachedPdfWithoutConversion() {
        // given
        final ApplicationCv generatedCv = org.mockito.Mockito.mock(ApplicationCv.class);
        final byte[] pdfBytes = "%PDF-1.4 cached".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";
        when(generatedCv.getApplicationCvId()).thenReturn(GENERATED_CV_ID);
        when(generatedCv.getFormat()).thenReturn(GeneratedCvFormat.DOCX);
        when(generatedCv.getOriginalFilename()).thenReturn("tailored.docx");
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.exists(previewKey)).thenReturn(true);
        when(objectStorage.download(previewKey)).thenReturn(pdfBytes);

        // when
        final GeneratedCvDtos.Preview preview = service.preview(USER_ID, GENERATED_CV_ID);

        // then
        assertThat(preview.bytes()).isEqualTo(pdfBytes);
        assertThat(preview.contentType()).isEqualTo("application/pdf");
        verify(gotenbergClient, never()).convertDocxToPdf(any(), any());
        verify(objectStorage, never()).download("opaque-key");
    }

    @Test
    void preview_whenDocxConversionFails_mapsToPreviewUnavailable() {
        // given
        final ApplicationCv generatedCv = docxGeneratedCv();
        final String previewKey = "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.exists(previewKey)).thenReturn(false);
        when(objectStorage.download("opaque-key")).thenReturn("docx".getBytes(StandardCharsets.UTF_8));
        when(gotenbergClient.convertDocxToPdf(any(), any())).thenThrow(DocumentConversionException.timeout());

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, GENERATED_CV_ID))
                .isInstanceOfSatisfying(
                        CvGenerationException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("GENERATED_CV_PREVIEW_UNAVAILABLE"));
        verify(objectStorage, never()).upload(any(), any(), any());
    }

    @Test
    void preview_whenStorageUnavailable_mapsToPreviewUnavailable() {
        // given
        final ApplicationCv generatedCv = org.mockito.Mockito.mock(ApplicationCv.class);
        when(generatedCv.getFormat()).thenReturn(GeneratedCvFormat.PDF);
        when(generatedCv.getObjectKey()).thenReturn("opaque-key");
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.download("opaque-key")).thenThrow(StorageUnavailableException.baseCv());

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, GENERATED_CV_ID))
                .isInstanceOfSatisfying(
                        CvGenerationException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("GENERATED_CV_PREVIEW_UNAVAILABLE"));
    }

    @Test
    void preview_whenConcurrentDocxCacheMisses_coalescesToOneConversion() throws Exception {
        // given
        final ApplicationCv generatedCv = docxGeneratedCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 coalesced".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";
        final CountDownLatch conversionStarted = new CountDownLatch(1);
        final CountDownLatch allowConversion = new CountDownLatch(1);
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.exists(previewKey)).thenReturn(false);
        when(objectStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "tailored.docx")).thenAnswer(invocation -> {
            conversionStarted.countDown();
            assertThat(allowConversion.await(5, TimeUnit.SECONDS)).isTrue();
            return pdfBytes;
        });

        final ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            // when
            final Future<GeneratedCvDtos.Preview> first =
                    executor.submit(() -> service.preview(USER_ID, GENERATED_CV_ID));
            final Future<GeneratedCvDtos.Preview> second =
                    executor.submit(() -> service.preview(USER_ID, GENERATED_CV_ID));
            assertThat(conversionStarted.await(5, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(200);
            allowConversion.countDown();

            // then
            assertThat(first.get(5, TimeUnit.SECONDS).bytes()).isEqualTo(pdfBytes);
            assertThat(second.get(5, TimeUnit.SECONDS).bytes()).isEqualTo(pdfBytes);
            verify(gotenbergClient, times(1)).convertDocxToPdf(docxBytes, "tailored.docx");
            verify(objectStorage, times(1)).upload(previewKey, pdfBytes, "application/pdf");
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void preview_afterFailedDocxConversion_clearsInFlightAndAllowsRetry() {
        // given
        final ApplicationCv generatedCv = docxGeneratedCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 retry".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.exists(previewKey)).thenReturn(false);
        when(objectStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "tailored.docx"))
                .thenThrow(DocumentConversionException.timeout())
                .thenReturn(pdfBytes);

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, GENERATED_CV_ID))
                .isInstanceOfSatisfying(
                        CvGenerationException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("GENERATED_CV_PREVIEW_UNAVAILABLE"));

        final GeneratedCvDtos.Preview retry = service.preview(USER_ID, GENERATED_CV_ID);

        assertThat(retry.bytes()).isEqualTo(pdfBytes);
        verify(gotenbergClient, times(2)).convertDocxToPdf(docxBytes, "tailored.docx");
        verify(objectStorage).upload(previewKey, pdfBytes, "application/pdf");
    }

    @Test
    void preview_whenCallerAbandonsWaiting_stillWarmsCachedPreview() throws Exception {
        // given
        final ApplicationCv generatedCv = docxGeneratedCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 warmed".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";
        final CountDownLatch conversionStarted = new CountDownLatch(1);
        final CountDownLatch allowConversion = new CountDownLatch(1);
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv));
        when(objectStorage.exists(previewKey)).thenReturn(false);
        when(objectStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "tailored.docx")).thenAnswer(invocation -> {
            conversionStarted.countDown();
            assertThat(allowConversion.await(5, TimeUnit.SECONDS)).isTrue();
            return pdfBytes;
        });

        final ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            // when
            executor.submit(() -> service.preview(USER_ID, GENERATED_CV_ID));
            assertThat(conversionStarted.await(5, TimeUnit.SECONDS)).isTrue();
            allowConversion.countDown();

            // then
            verify(objectStorage, timeout(5_000)).upload(previewKey, pdfBytes, "application/pdf");
            verify(gotenbergClient, times(1)).convertDocxToPdf(docxBytes, "tailored.docx");
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void preview_whenSourceDeletedDuringConversion_skipsCacheWarmAndFailsClosed() {
        // given
        final ApplicationCv generatedCv = docxGeneratedCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 orphan-guard".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv))
                .thenReturn(Optional.empty());
        when(objectStorage.exists(previewKey)).thenReturn(false);
        when(objectStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "tailored.docx")).thenReturn(pdfBytes);

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, GENERATED_CV_ID))
                .isInstanceOfSatisfying(
                        CvGenerationException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("GENERATED_CV_NOT_FOUND"));
        verify(objectStorage, never()).upload(any(), any(), any());
    }

    @Test
    void preview_whenSourceDeletedAfterCacheWarm_schedulesPreviewCleanupAndFailsClosed() {
        // given
        final ApplicationCv generatedCv = docxGeneratedCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 race".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/generated-cvs/" + GENERATED_CV_ID + ".pdf";
        when(applicationCvRepository.findByApplicationCvIdAndApplication_User_UserId(GENERATED_CV_ID, USER_ID))
                .thenReturn(Optional.of(generatedCv))
                .thenReturn(Optional.of(generatedCv))
                .thenReturn(Optional.empty());
        when(objectStorage.exists(previewKey)).thenReturn(false);
        when(objectStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "tailored.docx")).thenReturn(pdfBytes);
        when(storageCleanupJobRepository.findByObjectKeyAndCompletedAtIsNull(previewKey)).thenReturn(List.of());

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, GENERATED_CV_ID))
                .isInstanceOfSatisfying(
                        CvGenerationException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("GENERATED_CV_NOT_FOUND"));
        verify(objectStorage).upload(previewKey, pdfBytes, "application/pdf");
        verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) -> previewKey.equals(job.getObjectKey())));
    }

    private ApplicationCv docxGeneratedCv() {
        return mockGeneratedCv(
                GeneratedCvFormat.DOCX,
                "tailored.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    }

    private ApplicationCv mockGeneratedCv(
            final GeneratedCvFormat format, final String originalFilename, final String contentType) {
        final ApplicationCv generatedCv = org.mockito.Mockito.mock(ApplicationCv.class);
        when(generatedCv.getFormat()).thenReturn(format);
        when(generatedCv.getObjectKey()).thenReturn("opaque-key");
        when(generatedCv.getOriginalFilename()).thenReturn(originalFilename);
        if (format == GeneratedCvFormat.PDF) {
            when(generatedCv.getContentType()).thenReturn(contentType);
        }
        if (format == GeneratedCvFormat.DOCX) {
            when(generatedCv.getApplicationCvId()).thenReturn(GENERATED_CV_ID);
        }
        return generatedCv;
    }
}
