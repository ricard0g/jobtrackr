package com.ricard0g.jobtrackr_api.model.enums;

public enum CvGenerationStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED,
    CANCELLED;

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED;
    }

    public boolean isActive() {
        return this == PENDING || this == PROCESSING;
    }
}
