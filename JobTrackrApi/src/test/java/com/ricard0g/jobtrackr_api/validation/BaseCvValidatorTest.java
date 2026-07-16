package com.ricard0g.jobtrackr_api.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.ricard0g.jobtrackr_api.exception.BaseCvException;
import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;

class BaseCvValidatorTest {

    private final BaseCvValidator validator = new BaseCvValidator();

    @Test
    void validate_validMarkdown_returnsNormalizedMetadataAndChecksum() {
        // given
        final MockMultipartFile file = new MockMultipartFile(
                "file",
                "../Ricardo CV.md",
                "text/markdown",
                "# Ricardo Garcia\nSenior software engineer".getBytes(StandardCharsets.UTF_8));

        // when
        final ValidatedBaseCv result = validator.validate(file);

        // then
        assertThat(result.originalFilename()).isEqualTo("Ricardo CV.md");
        assertThat(result.format()).isEqualTo(BaseCvFormat.MARKDOWN);
        assertThat(result.sha256()).matches("[0-9a-f]{64}");
    }

    @Test
    void validate_markdownWithWrongMediaType_rejectsFormat() {
        // given
        final MockMultipartFile file = new MockMultipartFile(
                "file",
                "cv.md",
                "application/octet-stream",
                "A meaningful curriculum vitae".getBytes(StandardCharsets.UTF_8));

        // when / then
        assertCode(file, "INVALID_BASE_CV_FORMAT");
    }

    @Test
    void validate_markdownWithNulByte_rejectsMalformedDocument() {
        // given
        final byte[] bytes = "Meaningful CV text\0more text".getBytes(StandardCharsets.UTF_8);
        final MockMultipartFile file = new MockMultipartFile("file", "cv.md", "text/plain", bytes);

        // when / then
        assertCode(file, "MALFORMED_BASE_CV");
    }

    @Test
    void validate_validDocx_extractsText() throws Exception {
        // given
        final byte[] bytes;
        try (XWPFDocument document = new XWPFDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.createParagraph().createRun().setText("Senior software engineer curriculum vitae");
            document.write(output);
            bytes = output.toByteArray();
        }
        final MockMultipartFile file = new MockMultipartFile(
                "file",
                "cv.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                bytes);

        // when
        final ValidatedBaseCv result = validator.validate(file);

        // then
        assertThat(result.format()).isEqualTo(BaseCvFormat.DOCX);
    }

    @Test
    void validate_blankDocx_rejectsMalformedDocument() throws Exception {
        // given
        final byte[] bytes;
        try (XWPFDocument document = new XWPFDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.write(output);
            bytes = output.toByteArray();
        }
        final MockMultipartFile file = new MockMultipartFile(
                "file",
                "cv.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                bytes);

        // when / then
        assertCode(file, "MALFORMED_BASE_CV");
    }

    @Test
    void validate_oversizedFile_rejectsBeforeParsing() {
        // given
        final byte[] bytes = new byte[(int) BaseCvValidator.MAX_BYTES + 1];
        final MockMultipartFile file = new MockMultipartFile("file", "cv.pdf", "application/pdf", bytes);

        // when / then
        assertCode(file, "BASE_CV_TOO_LARGE");
    }

    private void assertCode(final MockMultipartFile file, final String code) {
        assertThatThrownBy(() -> validator.validate(file))
                .isInstanceOfSatisfying(
                        BaseCvException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo(code));
    }
}
