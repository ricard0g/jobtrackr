package com.ricard0g.jobtrackr_api.client;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class CvGenerationServiceClient {

    private final HttpClient cvGenerationHttpClient;
    private final CvGenerationProperties properties;
    private final ObjectMapper objectMapper;

    public GenerationResult generate(
            final byte[] baseCvBytes,
            final String originalFilename,
            final String contentType,
            final GeneratedCvFormat format,
            final String jobDescription,
            final String additionalInformation,
            final UUID correlationId) {
        final String boundary = "----JobTrackrBoundary" + UUID.randomUUID().toString().replace("-", "");
        final byte[] body = buildMultipartBody(
                boundary,
                baseCvBytes,
                originalFilename,
                contentType,
                format,
                jobDescription,
                additionalInformation,
                correlationId);

        final HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(trimTrailingSlash(properties.serviceBaseUrl()) + "/v1/generate"))
                .timeout(properties.requestTimeout())
                .header("Authorization", "Bearer " + properties.serviceToken())
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .header("Accept", "*/*")
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();

        final long started = System.currentTimeMillis();
        try {
            final HttpResponse<byte[]> response =
                    cvGenerationHttpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            final long elapsedMs = System.currentTimeMillis() - started;
            log.info(
                    "[CvGenerationServiceClient] - GENERATE: status: {}, correlationId: {}, elapsedMs: {}, bytes: {}",
                    response.statusCode(),
                    correlationId,
                    elapsedMs,
                    response.body() == null ? 0 : response.body().length);

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                final String modelId = Optional.ofNullable(response.headers().firstValue("X-Model-Id").orElse(null))
                        .orElse("unknown");
                final String workflowVersion = Optional.ofNullable(
                                response.headers().firstValue("X-Workflow-Version").orElse(null))
                        .orElse("unknown");
                final String responseContentType = response.headers()
                        .firstValue("Content-Type")
                        .orElse(format.contentType());
                return GenerationResult.success(
                        response.body(),
                        responseContentType,
                        modelId,
                        workflowVersion,
                        sha256(response.body()));
            }

            return GenerationResult.failure(
                    response.statusCode(),
                    parseErrorCode(response.body()),
                    parseErrorMessage(response.body()),
                    isRetryable(response.statusCode(), parseErrorCode(response.body())));
        } catch (final IOException exception) {
            log.error(
                    "[CvGenerationServiceClient] - GENERATE: networkFailure: true, correlationId: {}",
                    correlationId);
            return GenerationResult.failure(0, "PROVIDER_UNAVAILABLE", "CV generation service is unreachable", true);
        } catch (final InterruptedException exception) {
            Thread.currentThread().interrupt();
            return GenerationResult.failure(0, "GENERATION_TIMEOUT", "CV generation was interrupted", true);
        }
    }

    private byte[] buildMultipartBody(
            final String boundary,
            final byte[] baseCvBytes,
            final String originalFilename,
            final String contentType,
            final GeneratedCvFormat format,
            final String jobDescription,
            final String additionalInformation,
            final UUID correlationId) {
        try {
            final String specificationJson = objectMapper.writeValueAsString(new SpecificationPayload(
                    format.name(),
                    jobDescription,
                    additionalInformation,
                    correlationId.toString()));

            final StringBuilder preamble = new StringBuilder();
            preamble.append("--")
                    .append(boundary)
                    .append("\r\n")
                    .append("Content-Disposition: form-data; name=\"specification\"\r\n")
                    .append("Content-Type: application/json\r\n\r\n")
                    .append(specificationJson)
                    .append("\r\n--")
                    .append(boundary)
                    .append("\r\n")
                    .append("Content-Disposition: form-data; name=\"file\"; filename=\"")
                    .append(sanitizeFilename(originalFilename))
                    .append("\"\r\n")
                    .append("Content-Type: ")
                    .append(contentType == null ? "application/octet-stream" : contentType)
                    .append("\r\n\r\n");

            final byte[] preambleBytes = preamble.toString().getBytes(StandardCharsets.UTF_8);
            final byte[] epilogue = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
            final byte[] body = new byte[preambleBytes.length + baseCvBytes.length + epilogue.length];
            System.arraycopy(preambleBytes, 0, body, 0, preambleBytes.length);
            System.arraycopy(baseCvBytes, 0, body, preambleBytes.length, baseCvBytes.length);
            System.arraycopy(epilogue, 0, body, preambleBytes.length + baseCvBytes.length, epilogue.length);
            return body;
        } catch (final Exception exception) {
            throw new IllegalStateException("Failed to build multipart generation request", exception);
        }
    }

    private String parseErrorCode(final byte[] body) {
        final JsonNode node = readJson(body);
        if (node != null && node.hasNonNull("code")) {
            return node.get("code").asText();
        }
        return "INTERNAL_ERROR";
    }

    private String parseErrorMessage(final byte[] body) {
        final JsonNode node = readJson(body);
        if (node != null && node.hasNonNull("message")) {
            return node.get("message").asText();
        }
        return "CV generation failed";
    }

    private JsonNode readJson(final byte[] body) {
        if (body == null || body.length == 0) {
            return null;
        }
        try {
            return objectMapper.readTree(body);
        } catch (final IOException exception) {
            return null;
        }
    }

    private boolean isRetryable(final int statusCode, final String errorCode) {
        if ("PROVIDER_RATE_LIMITED".equals(errorCode)
                || "PROVIDER_UNAVAILABLE".equals(errorCode)
                || "GENERATION_TIMEOUT".equals(errorCode)) {
            return true;
        }
        return statusCode >= 500;
    }

    private static String trimTrailingSlash(final String value) {
        if (value.endsWith("/")) {
            return value.substring(0, value.length() - 1);
        }
        return value;
    }

    private static String sanitizeFilename(final String filename) {
        if (filename == null || filename.isBlank()) {
            return "base-cv.bin";
        }
        return filename.replace("\"", "").replace("\r", "").replace("\n", "");
    }

    private static String sha256(final byte[] bytes) {
        try {
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (final NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private record SpecificationPayload(
            String output_format,
            String job_description,
            String additional_information,
            String correlation_id) {}

    public record GenerationResult(
            boolean success,
            byte[] bytes,
            String contentType,
            String modelId,
            String workflowVersion,
            String sha256,
            int statusCode,
            String errorCode,
            String errorMessage,
            boolean retryable) {

        public static GenerationResult success(
                final byte[] bytes,
                final String contentType,
                final String modelId,
                final String workflowVersion,
                final String sha256) {
            return new GenerationResult(
                    true, bytes, contentType, modelId, workflowVersion, sha256, 200, null, null, false);
        }

        public static GenerationResult failure(
                final int statusCode,
                final String errorCode,
                final String errorMessage,
                final boolean retryable) {
            return new GenerationResult(
                    false, null, null, null, null, null, statusCode, errorCode, errorMessage, retryable);
        }

        public long byteSize() {
            return bytes == null ? 0L : bytes.length;
        }
    }
}
