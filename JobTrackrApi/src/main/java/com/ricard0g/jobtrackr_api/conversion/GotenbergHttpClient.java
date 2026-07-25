package com.ricard0g.jobtrackr_api.conversion;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
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

    @Qualifier("gotenbergHttpClient")
    private final HttpClient gotenbergHttpClient;
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
            final HttpResponse<byte[]> response =
                    gotenbergHttpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            final long elapsedMs = System.currentTimeMillis() - started;
            log.info(
                    "[GotenbergHttpClient] - CONVERT: status: {}, elapsedMs: {}, bytes: {}",
                    response.statusCode(),
                    elapsedMs,
                    response.body() == null ? 0 : response.body().length);

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw DocumentConversionException.serviceUnavailable();
            }
            return requireValidPdf(response.body());
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

    private static byte[] requireValidPdf(final byte[] body) {
        if (body == null || body.length == 0 || !startsWithPdfSignature(body)) {
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
