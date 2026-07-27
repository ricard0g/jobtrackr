package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.timeout;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
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
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.multipart.MultipartFile;

import com.ricard0g.jobtrackr_api.conversion.GotenbergClient;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvDownloadDto;
import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvPreviewDto;
import com.ricard0g.jobtrackr_api.exception.BaseCvException;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.exception.DocumentConversionException;
import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.StorageCleanupJob;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.repository.BaseCvRepository;
import com.ricard0g.jobtrackr_api.repository.StorageCleanupJobRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.storage.BaseCvStorage;
import com.ricard0g.jobtrackr_api.validation.BaseCvValidator;
import com.ricard0g.jobtrackr_api.validation.ValidatedBaseCv;

@ExtendWith(MockitoExtension.class)
class BaseCvServiceTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final Long BASE_CV_ID = 7L;
    private static final String CHECKSUM = "a".repeat(64);

    @Mock
    private UserRepository userRepository;

    @Mock
    private BaseCvRepository baseCvRepository;

    @Mock
    private com.ricard0g.jobtrackr_api.repository.CvGenerationRepository cvGenerationRepository;

    @Mock
    private BaseCvValidator baseCvValidator;

    @Mock
    private BaseCvStorage baseCvStorage;

    @Mock
    private GotenbergClient gotenbergClient;

    @Mock
    private StorageCleanupJobRepository storageCleanupJobRepository;

    @InjectMocks
    private BaseCvService service;

    @Test
    void upload_storesBeforePersistenceAndReturnsMetadata() {
        // given
        final MultipartFile file = mock(MultipartFile.class);
        final User user = mock(User.class);
        final ValidatedBaseCv validated = validated();
        final BaseCv saved = savedBaseCv();
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(userRepository.findByIdForUpdate(USER_ID)).thenReturn(Optional.of(user));
        when(baseCvValidator.validate(file)).thenReturn(validated);
        when(baseCvRepository.saveAndFlush(any(BaseCv.class))).thenReturn(saved);

        // when
        service.upload(USER_ID, file);

        // then
        final InOrder order = inOrder(userRepository, baseCvStorage, baseCvRepository);
        order.verify(userRepository).findByIdForUpdate(USER_ID);
        order.verify(baseCvStorage).upload(startsWith("users/" + USER_ID + "/base-cvs/"), any(byte[].class),
                any(String.class));
        order.verify(baseCvRepository).saveAndFlush(any(BaseCv.class));
    }

    @Test
    void upload_whenQuotaReached_doesNotContactStorage() {
        // given
        final MultipartFile file = mock(MultipartFile.class);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));
        when(userRepository.findByIdForUpdate(USER_ID)).thenReturn(Optional.of(mock(User.class)));
        when(baseCvValidator.validate(file)).thenReturn(validated());
        when(baseCvRepository.countByUser_UserId(USER_ID)).thenReturn(20L);

        // when / then
        assertThatThrownBy(() -> service.upload(USER_ID, file))
                .isInstanceOfSatisfying(BaseCvException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("BASE_CV_LIMIT_REACHED"));
        verify(baseCvStorage, never()).upload(any(), any(), any());
    }

    @Test
    void upload_whenPersistenceConflicts_compensatesStoredObject() {
        // given
        final MultipartFile file = mock(MultipartFile.class);
        final User user = mock(User.class);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(userRepository.findByIdForUpdate(USER_ID)).thenReturn(Optional.of(user));
        when(baseCvValidator.validate(file)).thenReturn(validated());
        when(baseCvRepository.saveAndFlush(any(BaseCv.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate"));

        // when / then
        assertThatThrownBy(() -> service.upload(USER_ID, file))
                .isInstanceOfSatisfying(BaseCvException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("DUPLICATE_BASE_CV"));
        verify(baseCvStorage).delete(startsWith("users/" + USER_ID + "/base-cvs/"));
    }

    @Test
    void createDownload_scopesLookupToOwnerAndReturnsSignedUri() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        final URI uri = URI.create("https://signed.example/object");
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCv.getOriginalFilename()).thenReturn("cv.pdf");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(baseCvStorage.createDownloadUri("opaque-key", "cv.pdf")).thenReturn(uri);

        // when
        final BaseCvDownloadDto download = service.createDownload(USER_ID, BASE_CV_ID);

        // then
        assertThat(download.uri()).isEqualTo(uri);
    }

    @Test
    void preview_streamsOwnedMarkdownAsUtf8TextMarkdown() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        final byte[] markdownBytes = "# Candidate Evidence\n\n- Java".getBytes(StandardCharsets.UTF_8);
        when(baseCv.getFormat()).thenReturn(BaseCvFormat.MARKDOWN);
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCv.getOriginalFilename()).thenReturn("notes.md");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(baseCvStorage.download("opaque-key")).thenReturn(markdownBytes);

        // when
        final BaseCvPreviewDto preview = service.preview(USER_ID, BASE_CV_ID);

        // then
        assertThat(preview.bytes()).isEqualTo(markdownBytes);
        assertThat(preview.contentType()).isEqualTo("text/markdown; charset=UTF-8");
        assertThat(preview.originalFilename()).isEqualTo("notes.md");
    }

    @Test
    void preview_whenDocxCacheMiss_convertsUploadsAndStreamsPdf() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 preview".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        when(baseCv.getBaseCvId()).thenReturn(BASE_CV_ID);
        when(baseCv.getFormat()).thenReturn(BaseCvFormat.DOCX);
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCv.getOriginalFilename()).thenReturn("resume.docx");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(baseCvStorage.exists(previewKey)).thenReturn(false);
        when(baseCvStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "resume.docx")).thenReturn(pdfBytes);

        // when
        final BaseCvPreviewDto preview = service.preview(USER_ID, BASE_CV_ID);

        // then
        assertThat(preview.bytes()).isEqualTo(pdfBytes);
        assertThat(preview.contentType()).isEqualTo("application/pdf");
        assertThat(preview.originalFilename()).isEqualTo("resume.pdf");
        verify(baseCvStorage).upload(previewKey, pdfBytes, "application/pdf");
    }

    @Test
    void preview_whenDocxCacheHit_streamsCachedPdfWithoutConversion() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        final byte[] pdfBytes = "%PDF-1.4 cached".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        when(baseCv.getBaseCvId()).thenReturn(BASE_CV_ID);
        when(baseCv.getFormat()).thenReturn(BaseCvFormat.DOCX);
        when(baseCv.getOriginalFilename()).thenReturn("resume.docx");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(baseCvStorage.exists(previewKey)).thenReturn(true);
        when(baseCvStorage.download(previewKey)).thenReturn(pdfBytes);

        // when
        final BaseCvPreviewDto preview = service.preview(USER_ID, BASE_CV_ID);

        // then
        assertThat(preview.bytes()).isEqualTo(pdfBytes);
        assertThat(preview.contentType()).isEqualTo("application/pdf");
        verify(gotenbergClient, never()).convertDocxToPdf(any(), any());
        verify(baseCvStorage, never()).download("opaque-key");
    }

    @Test
    void preview_whenDocxConversionFails_mapsToPreviewUnavailable() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        when(baseCv.getBaseCvId()).thenReturn(BASE_CV_ID);
        when(baseCv.getFormat()).thenReturn(BaseCvFormat.DOCX);
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCv.getOriginalFilename()).thenReturn("resume.docx");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(baseCvStorage.exists(previewKey)).thenReturn(false);
        when(baseCvStorage.download("opaque-key")).thenReturn("docx".getBytes(StandardCharsets.UTF_8));
        when(gotenbergClient.convertDocxToPdf(any(), any())).thenThrow(DocumentConversionException.timeout());

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, BASE_CV_ID))
                .isInstanceOfSatisfying(BaseCvException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("BASE_CV_PREVIEW_UNAVAILABLE"));
        verify(baseCvStorage, never()).upload(any(), any(), any());
    }

    @Test
    void delete_removesStorageObjectBeforeDatabaseRecordAndSchedulesPreviewCleanup() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(cvGenerationRepository.existsByBaseCv_BaseCvIdAndStatusIn(any(), any())).thenReturn(false);

        // when
        service.delete(USER_ID, BASE_CV_ID);

        // then
        final InOrder order = inOrder(baseCvStorage, baseCvRepository, storageCleanupJobRepository);
        order.verify(baseCvStorage).delete("opaque-key");
        order.verify(baseCvRepository).delete(baseCv);
        order.verify(baseCvRepository).flush();
        order.verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) -> previewKey.equals(job.getObjectKey())));
    }

    @Test
    void delete_whenStorageFails_retainsDatabaseRecord() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(cvGenerationRepository.existsByBaseCv_BaseCvIdAndStatusIn(any(), any())).thenReturn(false);
        org.mockito.Mockito.doThrow(com.ricard0g.jobtrackr_api.exception.StorageUnavailableException.baseCv())
                .when(baseCvStorage)
                .delete("opaque-key");

        // when / then
        assertThatThrownBy(() -> service.delete(USER_ID, BASE_CV_ID)).isInstanceOf(BaseCvException.class);
        verify(baseCvRepository, never()).delete(any());
        verify(storageCleanupJobRepository, never()).save(any());
    }

    @Test
    void preview_whenConcurrentDocxCacheMisses_coalescesToOneConversion() throws Exception {
        // given
        final BaseCv baseCv = docxBaseCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 coalesced".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        final CountDownLatch conversionStarted = new CountDownLatch(1);
        final CountDownLatch allowConversion = new CountDownLatch(1);
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(baseCvStorage.exists(previewKey)).thenReturn(false);
        when(baseCvStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "resume.docx")).thenAnswer(invocation -> {
            conversionStarted.countDown();
            assertThat(allowConversion.await(5, TimeUnit.SECONDS)).isTrue();
            return pdfBytes;
        });

        final ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            // when
            final Future<BaseCvPreviewDto> first = executor.submit(() -> service.preview(USER_ID, BASE_CV_ID));
            final Future<BaseCvPreviewDto> second = executor.submit(() -> service.preview(USER_ID, BASE_CV_ID));
            assertThat(conversionStarted.await(5, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(200);
            allowConversion.countDown();

            // then
            assertThat(first.get(5, TimeUnit.SECONDS).bytes()).isEqualTo(pdfBytes);
            assertThat(second.get(5, TimeUnit.SECONDS).bytes()).isEqualTo(pdfBytes);
            verify(gotenbergClient, times(1)).convertDocxToPdf(docxBytes, "resume.docx");
            verify(baseCvStorage, times(1)).upload(previewKey, pdfBytes, "application/pdf");
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void preview_afterFailedDocxConversion_clearsInFlightAndAllowsRetry() {
        // given
        final BaseCv baseCv = docxBaseCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 retry".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(baseCvStorage.exists(previewKey)).thenReturn(false);
        when(baseCvStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "resume.docx"))
                .thenThrow(DocumentConversionException.timeout())
                .thenReturn(pdfBytes);

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, BASE_CV_ID))
                .isInstanceOfSatisfying(BaseCvException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("BASE_CV_PREVIEW_UNAVAILABLE"));

        final BaseCvPreviewDto retry = service.preview(USER_ID, BASE_CV_ID);

        assertThat(retry.bytes()).isEqualTo(pdfBytes);
        verify(gotenbergClient, times(2)).convertDocxToPdf(docxBytes, "resume.docx");
        verify(baseCvStorage).upload(previewKey, pdfBytes, "application/pdf");
    }

    @Test
    void preview_whenCallerAbandonsWaiting_stillWarmsCachedPreview() throws Exception {
        // given
        final BaseCv baseCv = docxBaseCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 warmed".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        final CountDownLatch conversionStarted = new CountDownLatch(1);
        final CountDownLatch allowConversion = new CountDownLatch(1);
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(baseCvStorage.exists(previewKey)).thenReturn(false);
        when(baseCvStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "resume.docx")).thenAnswer(invocation -> {
            conversionStarted.countDown();
            assertThat(allowConversion.await(5, TimeUnit.SECONDS)).isTrue();
            return pdfBytes;
        });

        final ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            // when
            executor.submit(() -> service.preview(USER_ID, BASE_CV_ID));
            assertThat(conversionStarted.await(5, TimeUnit.SECONDS)).isTrue();
            allowConversion.countDown();

            // then
            verify(baseCvStorage, timeout(5_000)).upload(previewKey, pdfBytes, "application/pdf");
            verify(gotenbergClient, times(1)).convertDocxToPdf(docxBytes, "resume.docx");
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void delete_whenActiveCvGeneration_throwsBaseCvInUseAndLeavesSourceIntact() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        when(cvGenerationRepository.existsByBaseCv_BaseCvIdAndStatusIn(
                        eq(BASE_CV_ID),
                        eq(List.of(CvGenerationStatus.PENDING, CvGenerationStatus.PROCESSING))))
                .thenReturn(true);

        // when / then
        assertThatThrownBy(() -> service.delete(USER_ID, BASE_CV_ID))
                .isInstanceOfSatisfying(CvGenerationException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("BASE_CV_IN_USE"));
        verify(baseCvStorage, never()).delete(any());
        verify(baseCvRepository, never()).delete(any());
        verify(storageCleanupJobRepository, never()).save(any());
    }

    @Test
    void preview_whenSourceDeletedDuringConversion_skipsCacheWarmAndFailsClosed() {
        // given
        final BaseCv baseCv = docxBaseCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 orphan-guard".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID))
                .thenReturn(Optional.of(baseCv))
                .thenReturn(Optional.empty());
        when(baseCvStorage.exists(previewKey)).thenReturn(false);
        when(baseCvStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "resume.docx")).thenReturn(pdfBytes);

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, BASE_CV_ID))
                .isInstanceOfSatisfying(BaseCvException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("BASE_CV_NOT_FOUND"));
        verify(baseCvStorage, never()).upload(any(), any(), any());
    }

    @Test
    void preview_whenSourceDeletedAfterCacheWarm_schedulesPreviewCleanupAndFailsClosed() {
        // given
        final BaseCv baseCv = docxBaseCv();
        final byte[] docxBytes = "docx-bytes".getBytes(StandardCharsets.UTF_8);
        final byte[] pdfBytes = "%PDF-1.4 race".getBytes(StandardCharsets.UTF_8);
        final String previewKey = "users/" + USER_ID + "/previews/base-cvs/" + BASE_CV_ID + ".pdf";
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID))
                .thenReturn(Optional.of(baseCv))
                .thenReturn(Optional.of(baseCv))
                .thenReturn(Optional.empty());
        when(baseCvStorage.exists(previewKey)).thenReturn(false);
        when(baseCvStorage.download("opaque-key")).thenReturn(docxBytes);
        when(gotenbergClient.convertDocxToPdf(docxBytes, "resume.docx")).thenReturn(pdfBytes);
        when(storageCleanupJobRepository.findByObjectKeyAndCompletedAtIsNull(previewKey)).thenReturn(List.of());

        // when / then
        assertThatThrownBy(() -> service.preview(USER_ID, BASE_CV_ID))
                .isInstanceOfSatisfying(BaseCvException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo("BASE_CV_NOT_FOUND"));
        verify(baseCvStorage).upload(previewKey, pdfBytes, "application/pdf");
        verify(storageCleanupJobRepository)
                .save(argThat((StorageCleanupJob job) -> previewKey.equals(job.getObjectKey())));
    }

    private BaseCv docxBaseCv() {
        final BaseCv baseCv = mock(BaseCv.class);
        when(baseCv.getBaseCvId()).thenReturn(BASE_CV_ID);
        when(baseCv.getFormat()).thenReturn(BaseCvFormat.DOCX);
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCv.getOriginalFilename()).thenReturn("resume.docx");
        return baseCv;
    }

    private ValidatedBaseCv validated() {
        return new ValidatedBaseCv(
                "Meaningful CV content".getBytes(StandardCharsets.UTF_8),
                "cv.md",
                BaseCvFormat.MARKDOWN,
                "text/markdown",
                CHECKSUM);
    }

    private BaseCv savedBaseCv() {
        final BaseCv baseCv = mock(BaseCv.class);
        when(baseCv.getBaseCvId()).thenReturn(BASE_CV_ID);
        when(baseCv.getOriginalFilename()).thenReturn("cv.md");
        when(baseCv.getFormat()).thenReturn(BaseCvFormat.MARKDOWN);
        when(baseCv.getContentType()).thenReturn("text/markdown");
        when(baseCv.getByteSize()).thenReturn(21L);
        when(baseCv.getCreatedAt()).thenReturn(OffsetDateTime.parse("2026-07-16T12:00:00Z"));
        return baseCv;
    }
}
