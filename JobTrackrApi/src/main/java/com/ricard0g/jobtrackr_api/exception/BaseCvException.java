package com.ricard0g.jobtrackr_api.exception;

import org.springframework.http.HttpStatus;

import lombok.Getter;

@Getter
public class BaseCvException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public BaseCvException(final String code, final HttpStatus status, final String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public static BaseCvException invalidFormat() {
        return new BaseCvException(
                "INVALID_BASE_CV_FORMAT",
                HttpStatus.BAD_REQUEST,
                "Base CV must be a PDF, DOCX, or Markdown file with a matching content type");
    }

    public static BaseCvException tooLarge() {
        return new BaseCvException(
                "BASE_CV_TOO_LARGE",
                HttpStatus.PAYLOAD_TOO_LARGE,
                "Base CV must not exceed 10 MB");
    }

    public static BaseCvException malformed() {
        return new BaseCvException(
                "MALFORMED_BASE_CV",
                HttpStatus.BAD_REQUEST,
                "Base CV is malformed or does not contain meaningful extractable text");
    }

    public static BaseCvException protectedDocument() {
        return new BaseCvException(
                "PROTECTED_BASE_CV",
                HttpStatus.BAD_REQUEST,
                "Password-protected or encrypted Base CVs are not supported");
    }

    public static BaseCvException duplicate() {
        return new BaseCvException(
                "DUPLICATE_BASE_CV",
                HttpStatus.CONFLICT,
                "This Base CV has already been uploaded");
    }

    public static BaseCvException limitReached() {
        return new BaseCvException(
                "BASE_CV_LIMIT_REACHED",
                HttpStatus.CONFLICT,
                "The limit of 20 Base CVs has been reached");
    }

    public static BaseCvException notFound() {
        return new BaseCvException(
                "BASE_CV_NOT_FOUND",
                HttpStatus.NOT_FOUND,
                "Base CV not found");
    }

    public static BaseCvException storageUnavailable() {
        return new BaseCvException(
                "BASE_CV_STORAGE_UNAVAILABLE",
                HttpStatus.BAD_GATEWAY,
                "Base CV storage is temporarily unavailable");
    }
}
