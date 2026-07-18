package com.ricard0g.jobtrackr_api.exception;

import org.springframework.http.HttpStatus;

import lombok.Getter;

@Getter
public class CvGenerationException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public CvGenerationException(final String code, final HttpStatus status, final String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public static CvGenerationException missingJobDescription() {
        return new CvGenerationException(
                "MISSING_JOB_DESCRIPTION",
                HttpStatus.BAD_REQUEST,
                "A Job Description is required to generate a CV");
    }

    public static CvGenerationException jobDescriptionTooLong() {
        return new CvGenerationException(
                "JOB_DESCRIPTION_TOO_LONG",
                HttpStatus.BAD_REQUEST,
                "Job Description must not exceed 50000 characters");
    }

    public static CvGenerationException additionalInfoTooLong() {
        return new CvGenerationException(
                "ADDITIONAL_INFORMATION_TOO_LONG",
                HttpStatus.BAD_REQUEST,
                "Additional information must not exceed 5000 characters");
    }

    public static CvGenerationException invalidFormat() {
        return new CvGenerationException(
                "INVALID_GENERATION_FORMAT",
                HttpStatus.BAD_REQUEST,
                "Generated CV format must be PDF, DOCX, or MARKDOWN");
    }

    public static CvGenerationException baseCvUnavailable() {
        return new CvGenerationException(
                "BASE_CV_UNAVAILABLE",
                HttpStatus.BAD_REQUEST,
                "Selected Base CV is unavailable or not owned by you");
    }

    public static CvGenerationException baseCvInUse() {
        return new CvGenerationException(
                "BASE_CV_IN_USE",
                HttpStatus.CONFLICT,
                "This Base CV is in use by an active generation and cannot be deleted");
    }

    public static CvGenerationException consentRequired() {
        return new CvGenerationException(
                "AI_CONSENT_REQUIRED",
                HttpStatus.FORBIDDEN,
                "Explicit consent is required before sending CV data to Google Gemini");
    }

    public static CvGenerationException generationLimitReached() {
        return new CvGenerationException(
                "GENERATION_LIMIT_REACHED",
                HttpStatus.CONFLICT,
                "The limit of 20 generated CVs for this Application has been reached");
    }

    public static CvGenerationException notFound() {
        return new CvGenerationException(
                "CV_GENERATION_NOT_FOUND",
                HttpStatus.NOT_FOUND,
                "CV generation not found");
    }

    public static CvGenerationException invalidStatusTransition() {
        return new CvGenerationException(
                "INVALID_STATUS_TRANSITION",
                HttpStatus.CONFLICT,
                "This generation cannot be cancelled in its current status");
    }

    public static CvGenerationException missingIdempotencyKey() {
        return new CvGenerationException(
                "MISSING_IDEMPOTENCY_KEY",
                HttpStatus.BAD_REQUEST,
                "Idempotency-Key header is required");
    }

    public static CvGenerationException invalidIdempotencyKey() {
        return new CvGenerationException(
                "INVALID_IDEMPOTENCY_KEY",
                HttpStatus.BAD_REQUEST,
                "Idempotency-Key must be between 1 and 128 characters");
    }

    public static CvGenerationException applicationCvNotFound() {
        return new CvGenerationException(
                "APPLICATION_CV_NOT_FOUND",
                HttpStatus.NOT_FOUND,
                "Generated Application CV not found");
    }

    public static CvGenerationException storageUnavailable() {
        return new CvGenerationException(
                "STORAGE_UNAVAILABLE",
                HttpStatus.BAD_GATEWAY,
                "Document storage is temporarily unavailable");
    }
}
