package com.ricard0g.jobtrackr_api.model.enums;

public enum GeneratedCvFormat {
    PDF("pdf", "application/pdf"),
    DOCX("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    MARKDOWN("md", "text/markdown");

    private final String extension;
    private final String contentType;

    GeneratedCvFormat(final String extension, final String contentType) {
        this.extension = extension;
        this.contentType = contentType;
    }

    public String extension() {
        return extension;
    }

    public String contentType() {
        return contentType;
    }
}
