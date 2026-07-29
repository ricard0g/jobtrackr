package com.ricard0g.jobtrackr_api.conversion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.ricard0g.jobtrackr_api.config.gotenberg.GotenbergProperties;
import com.ricard0g.jobtrackr_api.exception.DocumentConversionException;
import com.sun.net.httpserver.HttpServer;

class GotenbergHttpClientTest {

    private static final byte[] DOCX_BYTES = "fake-docx".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PDF_BYTES = "%PDF-1.4 converted".getBytes(StandardCharsets.UTF_8);
    private static final long DEFAULT_MAX_RESPONSE_BYTES = 15L * 1024 * 1024;

    private HttpServer server;
    private String baseUrl;
    private final AtomicReference<String> lastContentType = new AtomicReference<>();
    private final AtomicReference<byte[]> lastBody = new AtomicReference<>();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void convertDocxToPdf_postsMultipartToLibreOfficeRouteAndReturnsPdfBytes() {
        // given
        server.createContext("/forms/libreoffice/convert", exchange -> {
            lastContentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            lastBody.set(exchange.getRequestBody().readAllBytes());
            exchange.getResponseHeaders().add("Content-Type", "application/pdf");
            exchange.sendResponseHeaders(200, PDF_BYTES.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(PDF_BYTES);
            }
        });
        final GotenbergClient client = client(DEFAULT_MAX_RESPONSE_BYTES);

        // when
        final byte[] pdf = client.convertDocxToPdf(DOCX_BYTES, "resume.docx");

        // then
        assertThat(pdf).isEqualTo(PDF_BYTES);
        assertThat(lastContentType.get()).startsWith("multipart/form-data; boundary=");
        final String body = new String(lastBody.get(), StandardCharsets.UTF_8);
        assertThat(body).contains("name=\"files\"");
        assertThat(body).contains("filename=\"resume.docx\"");
        assertThat(body).contains("fake-docx");
    }

    @Test
    void convertDocxToPdf_whenResponseExceedsMaxBytes_throwsMalformedResponse() {
        // given
        final byte[] oversized = new byte[64];
        Arrays.fill(oversized, (byte) 'A');
        System.arraycopy("%PDF-".getBytes(StandardCharsets.US_ASCII), 0, oversized, 0, 5);
        server.createContext("/forms/libreoffice/convert", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/pdf");
            exchange.sendResponseHeaders(200, oversized.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(oversized);
            }
        });

        // when / then
        assertThatThrownBy(() -> client(32).convertDocxToPdf(DOCX_BYTES, "resume.docx"))
                .isInstanceOfSatisfying(DocumentConversionException.class, exception -> {
                    assertThat(exception.getKind()).isEqualTo(DocumentConversionException.Kind.MALFORMED_RESPONSE);
                    assertThat(exception.getMessage()).contains("exceeded the allowed size");
                });
    }

    @Test
    void convertDocxToPdf_whenContentLengthExceedsMax_throwsWithoutBufferingBody() {
        // given
        server.createContext("/forms/libreoffice/convert", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/pdf");
            exchange.sendResponseHeaders(200, 1_000_000);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write("%PDF-".getBytes(StandardCharsets.US_ASCII));
                final byte[] chunk = new byte[8192];
                Arrays.fill(chunk, (byte) 'X');
                for (int i = 0; i < 100; i++) {
                    output.write(chunk);
                }
            }
        });

        // when / then
        assertThatThrownBy(() -> client(100).convertDocxToPdf(DOCX_BYTES, "resume.docx"))
                .isInstanceOfSatisfying(DocumentConversionException.class, exception -> {
                    assertThat(exception.getKind()).isEqualTo(DocumentConversionException.Kind.MALFORMED_RESPONSE);
                    assertThat(exception.getMessage()).contains("exceeded the allowed size");
                });
    }

    @Test
    void convertDocxToPdf_whenResponseIsEmpty_throwsMalformedResponse() {
        // given
        server.createContext("/forms/libreoffice/convert", exchange -> {
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });

        // when / then
        assertThatThrownBy(() -> client(DEFAULT_MAX_RESPONSE_BYTES).convertDocxToPdf(DOCX_BYTES, "resume.docx"))
                .isInstanceOfSatisfying(DocumentConversionException.class, exception -> {
                    assertThat(exception.getKind()).isEqualTo(DocumentConversionException.Kind.MALFORMED_RESPONSE);
                });
    }

    @Test
    void convertDocxToPdf_whenResponseIsNotPdf_throwsMalformedResponse() {
        // given
        final byte[] notPdf = "not-a-pdf".getBytes(StandardCharsets.UTF_8);
        server.createContext("/forms/libreoffice/convert", exchange -> {
            exchange.sendResponseHeaders(200, notPdf.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(notPdf);
            }
        });

        // when / then
        assertThatThrownBy(() -> client(DEFAULT_MAX_RESPONSE_BYTES).convertDocxToPdf(DOCX_BYTES, "resume.docx"))
                .isInstanceOfSatisfying(DocumentConversionException.class, exception -> {
                    assertThat(exception.getKind()).isEqualTo(DocumentConversionException.Kind.MALFORMED_RESPONSE);
                });
    }

    @Test
    void convertDocxToPdf_whenServiceReturnsError_throwsServiceUnavailable() {
        // given
        server.createContext("/forms/libreoffice/convert", exchange -> {
            final byte[] body = "busy".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(503, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });

        // when / then
        assertThatThrownBy(() -> client(DEFAULT_MAX_RESPONSE_BYTES).convertDocxToPdf(DOCX_BYTES, "resume.docx"))
                .isInstanceOfSatisfying(DocumentConversionException.class, exception -> {
                    assertThat(exception.getKind()).isEqualTo(DocumentConversionException.Kind.SERVICE_UNAVAILABLE);
                });
    }

    @Test
    void convertDocxToPdf_whenRequestTimesOut_throwsTimeout() {
        // given
        server.createContext("/forms/libreoffice/convert", exchange -> {
            try {
                Thread.sleep(500);
            } catch (final InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            exchange.sendResponseHeaders(200, PDF_BYTES.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(PDF_BYTES);
            }
        });
        final GotenbergClient client = new GotenbergHttpClient(
                HttpClient.newBuilder().connectTimeout(Duration.ofMillis(100)).build(),
                new GotenbergProperties(baseUrl, Duration.ofMillis(50), DEFAULT_MAX_RESPONSE_BYTES));

        // when / then
        assertThatThrownBy(() -> client.convertDocxToPdf(DOCX_BYTES, "resume.docx"))
                .isInstanceOfSatisfying(DocumentConversionException.class, exception -> {
                    assertThat(exception.getKind()).isEqualTo(DocumentConversionException.Kind.TIMEOUT);
                });
    }

    private GotenbergClient client(final long maxResponseBytes) {
        return new GotenbergHttpClient(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
                new GotenbergProperties(baseUrl, Duration.ofSeconds(5), maxResponseBytes));
    }
}
