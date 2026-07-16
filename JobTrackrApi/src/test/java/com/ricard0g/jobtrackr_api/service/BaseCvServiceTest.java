package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.multipart.MultipartFile;

import com.ricard0g.jobtrackr_api.dto.BaseCvDto.BaseCvDownloadDto;
import com.ricard0g.jobtrackr_api.exception.BaseCvException;
import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;
import com.ricard0g.jobtrackr_api.repository.BaseCvRepository;
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
    private BaseCvValidator baseCvValidator;

    @Mock
    private BaseCvStorage baseCvStorage;

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
        final InOrder order = inOrder(baseCvStorage, userRepository, baseCvRepository);
        order.verify(baseCvStorage).upload(startsWith("users/" + USER_ID + "/base-cvs/"), any(byte[].class),
                any(String.class));
        order.verify(userRepository).findByIdForUpdate(USER_ID);
        order.verify(baseCvRepository).saveAndFlush(any(BaseCv.class));
    }

    @Test
    void upload_whenQuotaReached_doesNotContactStorage() {
        // given
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));
        when(baseCvRepository.countByUser_UserId(USER_ID)).thenReturn(20L);

        // when / then
        assertThatThrownBy(() -> service.upload(USER_ID, mock(MultipartFile.class)))
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
    void delete_removesStorageObjectBeforeDatabaseRecord() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));

        // when
        service.delete(USER_ID, BASE_CV_ID);

        // then
        final InOrder order = inOrder(baseCvStorage, baseCvRepository);
        order.verify(baseCvStorage).delete("opaque-key");
        order.verify(baseCvRepository).delete(baseCv);
        order.verify(baseCvRepository).flush();
    }

    @Test
    void delete_whenStorageFails_retainsDatabaseRecord() {
        // given
        final BaseCv baseCv = mock(BaseCv.class);
        when(baseCv.getObjectKey()).thenReturn("opaque-key");
        when(baseCvRepository.findByBaseCvIdAndUser_UserId(BASE_CV_ID, USER_ID)).thenReturn(Optional.of(baseCv));
        org.mockito.Mockito.doThrow(BaseCvException.storageUnavailable()).when(baseCvStorage).delete("opaque-key");

        // when / then
        assertThatThrownBy(() -> service.delete(USER_ID, BASE_CV_ID)).isInstanceOf(BaseCvException.class);
        verify(baseCvRepository, never()).delete(any());
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
