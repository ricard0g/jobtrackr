package com.ricard0g.jobtrackr_api.storage;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.stereotype.Component;

import com.ricard0g.jobtrackr_api.config.storage.R2Properties;
import com.ricard0g.jobtrackr_api.exception.BaseCvException;

import lombok.RequiredArgsConstructor;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@Component
@RequiredArgsConstructor
public class R2BaseCvStorage implements BaseCvStorage {

    private final S3Client r2S3Client;
    private final S3Presigner r2S3Presigner;
    private final R2Properties properties;

    @Override
    public void upload(final String objectKey, final byte[] bytes, final String contentType) {
        try {
            final PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(objectKey)
                    .contentType(contentType)
                    .contentLength((long) bytes.length)
                    .build();
            r2S3Client.putObject(request, RequestBody.fromBytes(bytes));
        } catch (final SdkException exception) {
            throw BaseCvException.storageUnavailable();
        }
    }

    @Override
    public URI createDownloadUri(final String objectKey, final String originalFilename) {
        try {
            final String encodedFilename = URLEncoder.encode(originalFilename, StandardCharsets.UTF_8)
                    .replace("+", "%20");
            final GetObjectRequest objectRequest = GetObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(objectKey)
                    .responseContentDisposition("attachment; filename*=UTF-8''" + encodedFilename)
                    .build();
            final GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                    .signatureDuration(properties.signedUrlDuration())
                    .getObjectRequest(objectRequest)
                    .build();
            return r2S3Presigner.presignGetObject(presignRequest).url().toURI();
        } catch (final Exception exception) {
            throw BaseCvException.storageUnavailable();
        }
    }

    @Override
    public void delete(final String objectKey) {
        try {
            final DeleteObjectRequest request = DeleteObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(objectKey)
                    .build();
            r2S3Client.deleteObject(request);
        } catch (final SdkException exception) {
            throw BaseCvException.storageUnavailable();
        }
    }
}
