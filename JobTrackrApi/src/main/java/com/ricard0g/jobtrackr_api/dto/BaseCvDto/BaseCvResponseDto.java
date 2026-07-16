package com.ricard0g.jobtrackr_api.dto.BaseCvDto;

import java.time.OffsetDateTime;

import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;

public record BaseCvResponseDto(
        Long baseCvId,
        String originalFilename,
        BaseCvFormat format,
        String contentType,
        long byteSize,
        OffsetDateTime createdAt) {

    public static BaseCvResponseDto from(final BaseCv baseCv) {
        return new BaseCvResponseDto(
                baseCv.getBaseCvId(),
                baseCv.getOriginalFilename(),
                baseCv.getFormat(),
                baseCv.getContentType(),
                baseCv.getByteSize(),
                baseCv.getCreatedAt());
    }
}
