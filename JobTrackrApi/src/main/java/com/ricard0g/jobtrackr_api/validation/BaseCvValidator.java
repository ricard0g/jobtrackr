package com.ricard0g.jobtrackr_api.validation;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.EncryptedDocumentException;
import org.apache.poi.poifs.filesystem.FileMagic;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import com.ricard0g.jobtrackr_api.exception.BaseCvException;
import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;

@Component
public class BaseCvValidator {

    public static final long MAX_BYTES = 10L * 1024L * 1024L;

    private static final int MAX_FILENAME_LENGTH = 255;
    private static final int MIN_MEANINGFUL_CHARACTERS = 10;
    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String DOCX_CONTENT_TYPE =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final Map<String, BaseCvFormat> FORMATS_BY_EXTENSION = Map.of(
            "pdf", BaseCvFormat.PDF,
            "docx", BaseCvFormat.DOCX,
            "md", BaseCvFormat.MARKDOWN);

    public ValidatedBaseCv validate(final MultipartFile file) {
        if (file.isEmpty()) {
            throw BaseCvException.malformed();
        }
        if (file.getSize() > MAX_BYTES) {
            throw BaseCvException.tooLarge();
        }

        final String filename = sanitizeFilename(file.getOriginalFilename());
        final BaseCvFormat format = formatFrom(filename);
        final String contentType = normalizedContentType(file.getContentType());
        validateContentType(format, contentType);
        final byte[] bytes = readBytes(file);

        switch (format) {
            case PDF -> validatePdf(bytes);
            case DOCX -> validateDocx(bytes);
            case MARKDOWN -> validateMarkdown(bytes);
        }

        return new ValidatedBaseCv(bytes, filename, format, contentType, sha256(bytes));
    }

    private String sanitizeFilename(final String originalFilename) {
        if (originalFilename == null) {
            throw BaseCvException.invalidFormat();
        }
        final String withoutPath = originalFilename.replace('\\', '/');
        final int separator = withoutPath.lastIndexOf('/');
        final String leafName = withoutPath.substring(separator + 1);
        final String sanitized = leafName.replaceAll("[\\p{Cntrl}]", "").trim();
        if (sanitized.isBlank()) {
            throw BaseCvException.invalidFormat();
        }
        if (sanitized.length() <= MAX_FILENAME_LENGTH) {
            return sanitized;
        }

        final int extensionStart = sanitized.lastIndexOf('.');
        if (extensionStart <= 0) {
            return sanitized.substring(0, MAX_FILENAME_LENGTH);
        }
        final String extension = sanitized.substring(extensionStart);
        return sanitized.substring(0, MAX_FILENAME_LENGTH - extension.length()) + extension;
    }

    private BaseCvFormat formatFrom(final String filename) {
        final int extensionStart = filename.lastIndexOf('.');
        if (extensionStart < 0 || extensionStart == filename.length() - 1) {
            throw BaseCvException.invalidFormat();
        }
        final String extension = filename.substring(extensionStart + 1).toLowerCase(Locale.ROOT);
        final BaseCvFormat format = FORMATS_BY_EXTENSION.get(extension);
        if (format == null) {
            throw BaseCvException.invalidFormat();
        }
        return format;
    }

    private String normalizedContentType(final String value) {
        if (value == null) {
            throw BaseCvException.invalidFormat();
        }
        return value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
    }

    private void validateContentType(final BaseCvFormat format, final String contentType) {
        final boolean valid = switch (format) {
            case PDF -> PDF_CONTENT_TYPE.equals(contentType);
            case DOCX -> DOCX_CONTENT_TYPE.equals(contentType);
            case MARKDOWN -> "text/markdown".equals(contentType) || "text/plain".equals(contentType);
        };
        if (!valid) {
            throw BaseCvException.invalidFormat();
        }
    }

    private byte[] readBytes(final MultipartFile file) {
        try {
            return file.getBytes();
        } catch (final IOException exception) {
            throw BaseCvException.malformed();
        }
    }

    private void validatePdf(final byte[] bytes) {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            if (document.isEncrypted()) {
                throw BaseCvException.protectedDocument();
            }
            requireMeaningfulText(new PDFTextStripper().getText(document));
        } catch (final InvalidPasswordException exception) {
            throw BaseCvException.protectedDocument();
        } catch (final IOException exception) {
            throw BaseCvException.malformed();
        }
    }

    private void validateDocx(final byte[] bytes) {
        try {
            final FileMagic magic = FileMagic.valueOf(new ByteArrayInputStream(bytes));
            if (magic == FileMagic.OLE2) {
                throw BaseCvException.protectedDocument();
            }
            if (magic != FileMagic.OOXML) {
                throw BaseCvException.malformed();
            }
        } catch (final IOException exception) {
            throw BaseCvException.malformed();
        }

        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes));
                XWPFWordExtractor extractor = new XWPFWordExtractor(document)) {
            final boolean protectedDocument = document.isEnforcedReadonlyProtection()
                    || document.isEnforcedCommentsProtection()
                    || document.isEnforcedFillingFormsProtection()
                    || document.isEnforcedTrackedChangesProtection();
            if (protectedDocument) {
                throw BaseCvException.protectedDocument();
            }
            requireMeaningfulText(extractor.getText());
        } catch (final EncryptedDocumentException exception) {
            throw BaseCvException.protectedDocument();
        } catch (final IOException | RuntimeException exception) {
            if (exception instanceof BaseCvException baseCvException) {
                throw baseCvException;
            }
            throw BaseCvException.malformed();
        }
    }

    private void validateMarkdown(final byte[] bytes) {
        if (containsNul(bytes)) {
            throw BaseCvException.malformed();
        }
        try {
            final String text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
            requireMeaningfulText(text);
        } catch (final CharacterCodingException exception) {
            throw BaseCvException.malformed();
        }
    }

    private boolean containsNul(final byte[] bytes) {
        for (final byte value : bytes) {
            if (value == 0) {
                return true;
            }
        }
        return false;
    }

    private void requireMeaningfulText(final String text) {
        final long meaningfulCharacters = text.codePoints()
                .filter(Character::isLetterOrDigit)
                .limit(MIN_MEANINGFUL_CHARACTERS)
                .count();
        if (meaningfulCharacters < MIN_MEANINGFUL_CHARACTERS) {
            throw BaseCvException.malformed();
        }
    }

    private String sha256(final byte[] bytes) {
        try {
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (final NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
