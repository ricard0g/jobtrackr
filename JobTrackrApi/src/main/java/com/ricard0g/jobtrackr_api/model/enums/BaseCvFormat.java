package com.ricard0g.jobtrackr_api.model.enums;

public enum BaseCvFormat {
    PDF("pdf"),
    DOCX("docx"),
    MARKDOWN("md");

    private final String extension;

    BaseCvFormat(final String extension) {
        this.extension = extension;
    }

    public String extension() {
        return extension;
    }
}
