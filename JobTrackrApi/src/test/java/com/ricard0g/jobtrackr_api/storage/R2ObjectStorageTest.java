package com.ricard0g.jobtrackr_api.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.config.storage.R2Properties;
import com.ricard0g.jobtrackr_api.exception.StorageUnavailableException;

import software.amazon.awssdk.awscore.exception.AwsErrorDetails;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@ExtendWith(MockitoExtension.class)
class R2ObjectStorageTest {

    @Mock
    private S3Client r2S3Client;

    @Mock
    private S3Presigner r2S3Presigner;

    private R2ObjectStorage storage;

    @BeforeEach
    void setUp() {
        storage = new R2ObjectStorage(
                r2S3Client,
                r2S3Presigner,
                new R2Properties(
                        "https://example.eu.r2.cloudflarestorage.com",
                        "key",
                        "secret",
                        "bucket",
                        60));
    }

    @Test
    void exists_whenObjectPresent_returnsTrue() {
        // given
        when(r2S3Client.headObject(any(HeadObjectRequest.class))).thenReturn(HeadObjectResponse.builder().build());

        // when / then
        assertThat(storage.exists("users/u/previews/base-cvs/1.pdf")).isTrue();
        verify(r2S3Client).headObject(any(HeadObjectRequest.class));
    }

    @Test
    void exists_whenObjectMissing_returnsFalse() {
        // given
        when(r2S3Client.headObject(any(HeadObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().message("missing").build());

        // when / then
        assertThat(storage.exists("users/u/previews/base-cvs/1.pdf")).isFalse();
    }

    @Test
    void exists_whenHeadReturns404_returnsFalse() {
        // given
        final S3Exception notFound = (S3Exception) S3Exception.builder()
                .statusCode(404)
                .awsErrorDetails(AwsErrorDetails.builder().errorCode("NotFound").build())
                .build();
        when(r2S3Client.headObject(any(HeadObjectRequest.class))).thenThrow(notFound);

        // when / then
        assertThat(storage.exists("users/u/previews/base-cvs/1.pdf")).isFalse();
    }

    @Test
    void exists_whenStorageFails_throwsUnavailable() {
        // given
        when(r2S3Client.headObject(any(HeadObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(500).message("boom").build());

        // when / then
        assertThatThrownBy(() -> storage.exists("users/u/previews/base-cvs/1.pdf"))
                .isInstanceOf(StorageUnavailableException.class);
    }
}
