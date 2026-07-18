package com.ricard0g.jobtrackr_api.exception;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import com.ricard0g.jobtrackr_api.dto.ErrorResponse;

import jakarta.validation.ConstraintViolationException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(CvGenerationException.class)
    public ResponseEntity<ErrorResponse> handleCvGeneration(final CvGenerationException exception) {
        return ResponseEntity.status(exception.getStatus())
                .body(ErrorResponse.of(exception.getCode(), exception.getMessage()));
    }

    @ExceptionHandler(StorageUnavailableException.class)
    public ResponseEntity<ErrorResponse> handleStorageUnavailable(final StorageUnavailableException exception) {
        return ResponseEntity.status(exception.getStatus())
                .body(ErrorResponse.of(exception.getCode(), exception.getMessage()));
    }

    @ExceptionHandler(BaseCvException.class)
    public ResponseEntity<ErrorResponse> handleBaseCv(final BaseCvException exception) {
        return ResponseEntity.status(exception.getStatus())
                .body(ErrorResponse.of(exception.getCode(), exception.getMessage()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleMaxUploadSize(final MaxUploadSizeExceededException exception) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ErrorResponse.of("BASE_CV_TOO_LARGE", "Base CV must not exceed 10 MB"));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ErrorResponse> handleMissingMultipartFile(
            final MissingServletRequestPartException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("INVALID_BASE_CV_FORMAT", "Choose exactly one Base CV file"));
    }

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUserNotFound(final UserNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("USER_NOT_FOUND", exception.getMessage()));
    }

    @ExceptionHandler(CompanyNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleCompanyNotFound(final CompanyNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("COMPANY_NOT_FOUND", exception.getMessage()));
    }

    @ExceptionHandler(DuplicateCompanyNameException.class)
    public ResponseEntity<ErrorResponse> handleDuplicateCompanyName(
            final DuplicateCompanyNameException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of("DUPLICATE_COMPANY_NAME", exception.getMessage()));
    }

    @ExceptionHandler(CompanyHasApplicationsException.class)
    public ResponseEntity<ErrorResponse> handleCompanyHasApplications(
            final CompanyHasApplicationsException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of("COMPANY_HAS_APPLICATIONS", exception.getMessage()));
    }

    @ExceptionHandler(ApplicationNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleApplicationNotFound(
            final ApplicationNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("APPLICATION_NOT_FOUND", exception.getMessage()));
    }

    @ExceptionHandler(InterviewNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleInterviewNotFound(final InterviewNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("INTERVIEW_NOT_FOUND", exception.getMessage()));
    }

    @ExceptionHandler(InvalidApplicationSalaryRangeException.class)
    public ResponseEntity<ErrorResponse> handleInvalidApplicationSalaryRange(
            final InvalidApplicationSalaryRangeException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("INVALID_APPLICATION_SALARY_RANGE", exception.getMessage()));
    }

    @ExceptionHandler(TagNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleTagNotFound(final TagNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of("TAG_NOT_FOUND", exception.getMessage()));
    }

    @ExceptionHandler(DuplicateTagNameException.class)
    public ResponseEntity<ErrorResponse> handleDuplicateTagName(final DuplicateTagNameException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of("DUPLICATE_TAG_NAME", exception.getMessage()));
    }

    @ExceptionHandler(TooManyApplicationTagsException.class)
    public ResponseEntity<ErrorResponse> handleTooManyApplicationTags(
            final TooManyApplicationTagsException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("TOO_MANY_APPLICATION_TAGS", exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(
            final MethodArgumentNotValidException exception) {
        final List<ErrorResponse.FieldError> fieldErrors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ErrorResponse.FieldError(error.getField(), error.getDefaultMessage()))
                .toList();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("VALIDATION_ERROR", "Request validation failed", fieldErrors));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolation(
            final ConstraintViolationException exception) {
        final List<ErrorResponse.FieldError> fieldErrors = exception.getConstraintViolations().stream()
                .map(violation -> new ErrorResponse.FieldError(
                        violation.getPropertyPath().toString(), violation.getMessage()))
                .toList();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("VALIDATION_ERROR", "Request validation failed", fieldErrors));
    }

    @ExceptionHandler(DuplicateEmailException.class)
    public ResponseEntity<ErrorResponse> handleDuplicateEmail(final DuplicateEmailException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of("DUPLICATE_EMAIL", exception.getMessage()));
    }

    @ExceptionHandler(InvalidRefreshTokenException.class)
    public ResponseEntity<ErrorResponse> handleInvalidRefreshToken(
            final InvalidRefreshTokenException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of("INVALID_REFRESH_TOKEN", exception.getMessage()));
    }

    @ExceptionHandler(RefreshTokenReuseException.class)
    public ResponseEntity<ErrorResponse> handleRefreshTokenReuse(final RefreshTokenReuseException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of("REFRESH_TOKEN_REUSE", exception.getMessage()));
    }

    @ExceptionHandler(org.springframework.security.authentication.BadCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleBadCredentials(
            final org.springframework.security.authentication.BadCredentialsException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of("INVALID_CREDENTIALS", "Invalid email or password"));
    }
}
