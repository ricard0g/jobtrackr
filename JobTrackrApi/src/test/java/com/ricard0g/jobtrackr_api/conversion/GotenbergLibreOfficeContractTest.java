package com.ricard0g.jobtrackr_api.conversion;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.time.Duration;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.ricard0g.jobtrackr_api.config.gotenberg.GotenbergProperties;

@Testcontainers(disabledWithoutDocker = true)
class GotenbergLibreOfficeContractTest {

    private static final DockerImageName GOTENBERG_IMAGE =
            DockerImageName.parse("gotenberg/gotenberg:8.34.0-libreoffice");

    private static final String EXPECTED_NAME = "Alex Candidate";
    private static final String EXPECTED_ROLE = "Senior Software Engineer";
    private static final String EXPECTED_SKILL = "Distributed systems";

    @Container
    @SuppressWarnings("resource")
    private static final GenericContainer<?> GOTENBERG = new GenericContainer<>(GOTENBERG_IMAGE)
            .withExposedPorts(3000)
            .withEnv("API_TIMEOUT", "30s")
            .waitingFor(Wait.forHttp("/health").forPort(3000).withStartupTimeout(Duration.ofMinutes(2)));

    @Test
    void convertsRepresentativeGeneratedCvDocxToReadablePdf() throws Exception {
        // given
        final byte[] docxBytes = representativeGeneratedCvDocx();
        final GotenbergClient client = new GotenbergHttpClient(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
                new GotenbergProperties(gotenbergBaseUrl(), Duration.ofSeconds(35), 0));

        // when
        final byte[] pdfBytes = client.convertDocxToPdf(docxBytes, "generated-cv.docx");

        // then
        assertThat(pdfBytes).isNotEmpty();
        assertThat(new String(pdfBytes, 0, Math.min(5, pdfBytes.length))).isEqualTo("%PDF-");

        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            assertThat(document.getNumberOfPages()).isGreaterThanOrEqualTo(1);
            final String text = new PDFTextStripper().getText(document);
            assertThat(text).contains(EXPECTED_NAME);
            assertThat(text).contains(EXPECTED_ROLE);
            assertThat(text).contains(EXPECTED_SKILL);
        }
    }

    private static String gotenbergBaseUrl() {
        return "http://" + GOTENBERG.getHost() + ":" + GOTENBERG.getMappedPort(3000);
    }

    private static byte[] representativeGeneratedCvDocx() throws Exception {
        try (XWPFDocument document = new XWPFDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.createParagraph().createRun().setText(EXPECTED_NAME);
            document.createParagraph().createRun().setText(EXPECTED_ROLE);
            document.createParagraph().createRun().setText("Experience");
            document.createParagraph()
                    .createRun()
                    .setText("Built " + EXPECTED_SKILL + " platforms for high-traffic product teams.");
            document.createParagraph().createRun().setText("Skills");
            document.createParagraph().createRun().setText("Java, Spring Boot, PostgreSQL, React");
            document.write(output);
            return output.toByteArray();
        }
    }
}
