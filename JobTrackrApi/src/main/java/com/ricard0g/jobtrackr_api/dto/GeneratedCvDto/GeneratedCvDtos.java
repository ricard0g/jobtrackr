package com.ricard0g.jobtrackr_api.dto.GeneratedCvDto;

import java.time.OffsetDateTime;
import java.util.List;

import com.ricard0g.jobtrackr_api.model.ApplicationCv;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;

public final class GeneratedCvDtos {

    private GeneratedCvDtos() {}

    public record Response(
            Long generatedCvId,
            Long applicationId,
            Integer version,
            String originalFilename,
            GeneratedCvFormat format,
            String contentType,
            long byteSize,
            Long generationId,
            OffsetDateTime createdAt) {

        public static Response from(final ApplicationCv applicationCv) {
            final Long generationId = applicationCv.getGeneration() == null
                    ? null
                    : applicationCv.getGeneration().getCvGenerationId();
            return new Response(
                    applicationCv.getApplicationCvId(),
                    applicationCv.getApplication().getApplicationId(),
                    applicationCv.getVersion(),
                    applicationCv.getOriginalFilename(),
                    applicationCv.getFormat(),
                    applicationCv.getContentType(),
                    applicationCv.getByteSize(),
                    generationId,
                    applicationCv.getCreatedAt());
        }
    }

    public record Summary(
            Long generatedCvId,
            Long applicationId,
            String applicationTitle,
            String companyName,
            Integer version,
            String originalFilename,
            GeneratedCvFormat format,
            String contentType,
            long byteSize,
            Long generationId,
            OffsetDateTime createdAt) {

        public static Summary from(final ApplicationCv applicationCv) {
            final Long generationId = applicationCv.getGeneration() == null
                    ? null
                    : applicationCv.getGeneration().getCvGenerationId();
            return new Summary(
                    applicationCv.getApplicationCvId(),
                    applicationCv.getApplication().getApplicationId(),
                    applicationCv.getApplication().getApplicationTitle(),
                    applicationCv.getApplication().getCompany().getCompanyName(),
                    applicationCv.getVersion(),
                    applicationCv.getOriginalFilename(),
                    applicationCv.getFormat(),
                    applicationCv.getContentType(),
                    applicationCv.getByteSize(),
                    generationId,
                    applicationCv.getCreatedAt());
        }
    }

    public record Page(List<Summary> items, String nextCursor) {}

    public record Download(String uri) {}
}
