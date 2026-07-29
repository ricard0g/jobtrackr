package com.ricard0g.jobtrackr_api.conversion;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import com.ricard0g.jobtrackr_api.config.gotenberg.GotenbergProperties;
import com.ricard0g.jobtrackr_api.exception.DocumentConversionException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class GotenbergHttpClient implements GotenbergClient {

    private static final String CONVERT_PATH = "/forms/libreoffice/convert";
    private static final String MULTIPART_FIELD_NAME = "files";
    private static final String PDF_SIGNATURE = "%PDF-";
    private static final String DOCX_CONTENT_TYPE =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final int READ_BUFFER_SIZE = 8192;

    @Qualifier("gotenbergJdkHttpClient")
    private final HttpClient gotenbergJdkHttpClient;
    private final GotenbergProperties properties;

    @Override
    public byte[] convertDocxToPdf(final byte[] docxBytes, final String originalFilename) {
        final String boundary = "----JobTrackrGotenberg" + UUID.randomUUID().toString().replace("-", "");
        final byte[] body = buildMultipartBody(boundary, docxBytes, originalFilename);

        final HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(trimTrailingSlash(properties.baseUrl()) + CONVERT_PATH))
                .timeout(properties.requestTimeout())
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .header("Accept", "application/pdf")
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();

        final long started = System.currentTimeMillis();
        try {
            final HttpResponse<InputStream> response =
                    gotenbergJdkHttpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream responseBody = response.body()) {
                final long elapsedMs = System.currentTimeMillis() - started;
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    log.info(
                            "[GotenbergHttpClient] - CONVERT: status: {}, elapsedMs: {}",
                            response.statusCode(),
                            elapsedMs);
                    throw DocumentConversionException.serviceUnavailable();
                }
                rejectIfDeclaredLengthTooLarge(response);
                final byte[] pdfBytes = readBounded(responseBody, properties.maxResponseBytes());
                log.info(
                        "[GotenbergHttpClient] - CONVERT: status: {}, elapsedMs: {}, bytes: {}",
                        response.statusCode(),
                        elapsedMs,
                        pdfBytes.length);
                return requireValidPdf(pdfBytes);
            }
        } catch (final DocumentConversionException exception) {
            throw exception;
        } catch (final HttpTimeoutException exception) {
            log.error("[GotenbergHttpClient] - CONVERT: timeout: true");
            throw DocumentConversionException.timeout(exception);
        } catch (final IOException exception) {
            if (isTimeout(exception)) {
                log.error("[GotenbergHttpClient] - CONVERT: timeout: true");
                throw DocumentConversionException.timeout(exception);
            }
            log.error("[GotenbergHttpClient] - CONVERT: networkFailure: true");
            throw DocumentConversionException.serviceUnavailable(exception);
        } catch (final InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw DocumentConversionException.timeout(exception);
        }
    }

    private void rejectIfDeclaredLengthTooLarge(final HttpResponse<?> response) {
        final Optional<String> contentLength = response.headers().firstValue("Content-Length");
        if (contentLength.isEmpty()) {
            return;
        }
        try {
            final long declaredLength = Long.parseLong(contentLength.get());
            if (declaredLength > properties.maxResponseBytes()) {
                throw DocumentConversionException.responseTooLarge();
            }
        } catch (final NumberFormatException ignored) {
            // Fall through to bounded stream read.
        }
    }

    private static byte[] readBounded(final InputStream input, final long maxBytes) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        final byte[] buffer = new byte[READ_BUFFER_SIZE];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) {
                throw DocumentConversionException.responseTooLarge();
            }
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static byte[] requireValidPdf(final byte[] body) {
        if (body.length == 0 || !startsWithPdfSignature(body)) {
            throw DocumentConversionException.malformedResponse();
        }
        return body;
    }

    private static boolean startsWithPdfSignature(final byte[] body) {
        final byte[] signature = PDF_SIGNATURE.getBytes(StandardCharsets.US_ASCII);
        if (body.length < signature.length) {
            return false;
        }
        return Arrays.equals(body, 0, signature.length, signature, 0, signature.length);
    }

    private static boolean isTimeout(final IOException exception) {
        Throwable current = exception;
        while (current != null) {
            if (current instanceof HttpTimeoutException) {
                return true;
            }
            final String message = current.getMessage();
            if (message != null && message.toLowerCase().contains("timed out")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static byte[] buildMultipartBody(
            final String boundary, final byte[] docxBytes, final String originalFilename) {
        final String filename = sanitizeFilename(originalFilename);
        final String preamble = "--"
                + boundary
                + "\r\n"
                + "Content-Disposition: form-data; name=\""
                + MULTIPART_FIELD_NAME
                + "\"; filename=\""
                + filename
                + "\"\r\n"
                + "Content-Type: "
                + DOCX_CONTENT_TYPE
                + "\r\n\r\n";
        final byte[] preambleBytes = preamble.getBytes(StandardCharsets.UTF_8);
        final byte[] epilogue = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        final byte[] body = new byte[preambleBytes.length + docxBytes.length + epilogue.length];
        System.arraycopy(preambleBytes, 0, body, 0, preambleBytes.length);
        System.arraycopy(docxBytes, 0, body, preambleBytes.length, docxBytes.length);
        System.arraycopy(epilogue, 0, body, preambleBytes.length + docxBytes.length, epilogue.length);
        return body;
    }

    private static String sanitizeFilename(final String filename) {
        return filename.replace("\"", "").replace("\r", "").replace("\n", "");
    }

    private static String trimTrailingSlash(final String value) {
        if (value.endsWith("/")) {
            return value.substring(0, value.length() - 1);
        }
        return value;
    }
}
