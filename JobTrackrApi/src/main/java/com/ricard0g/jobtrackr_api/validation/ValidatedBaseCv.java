package com.ricard0g.jobtrackr_api.validation;

import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;

public record ValidatedBaseCv(
        byte[] bytes,
        String originalFilename,
        BaseCvFormat format,
        String contentType,
        String sha256) {
}
