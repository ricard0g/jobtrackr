package com.ricard0g.jobtrackr_api.exception;

import org.springframework.http.HttpStatus;

import lombok.Getter;

@Getter
public class StorageUnavailableException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public StorageUnavailableException(final String code, final HttpStatus status, final String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public static StorageUnavailableException baseCv() {
        return new StorageUnavailableException(
                "BASE_CV_STORAGE_UNAVAILABLE",
                HttpStatus.BAD_GATEWAY,
                "Base CV storage is temporarily unavailable");
    }

    public static StorageUnavailableException generation() {
        return new StorageUnavailableException(
                "STORAGE_UNAVAILABLE",
                HttpStatus.BAD_GATEWAY,
                "Document storage is temporarily unavailable");
    }
}
