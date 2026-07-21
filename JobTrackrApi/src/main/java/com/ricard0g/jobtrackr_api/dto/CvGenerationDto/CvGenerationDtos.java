package com.ricard0g.jobtrackr_api.dto.CvGenerationDto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.ricard0g.jobtrackr_api.model.CvGeneration;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public final class CvGenerationDtos {

    private CvGenerationDtos() {}

    public record CreateRequest(
            @NotNull @Positive Long applicationId,
            @NotNull @Positive Long baseCvId,
            @NotNull GeneratedCvFormat format,
            @NotBlank @Size(max = 50_000) String jobDescription,
            @Size(max = 5_000) String additionalInformation,
            boolean consentAccepted) {}

    public record Response(
            Long cvGenerationId,
            Long applicationId,
            Long baseCvId,
            GeneratedCvFormat requestedFormat,
            CvGenerationStatus status,
            String idempotencyKey,
            UUID correlationId,
            String errorCode,
            String errorMessage,
            Long applicationCvId,
            String modelId,
            String workflowVersion,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            OffsetDateTime startedAt,
            OffsetDateTime completedAt,
            String statusUrl) {

        public static Response from(final CvGeneration generation) {
            final Long baseCvId =
                    generation.getBaseCv() == null ? null : generation.getBaseCv().getBaseCvId();
            final Long applicationCvId = generation.getApplicationCv() == null
                    ? null
                    : generation.getApplicationCv().getApplicationCvId();
            return new Response(
                    generation.getCvGenerationId(),
                    generation.getApplication().getApplicationId(),
                    baseCvId,
                    generation.getRequestedFormat(),
                    generation.getStatus(),
                    generation.getIdempotencyKey(),
                    generation.getCorrelationId(),
                    generation.getErrorCode(),
                    generation.getErrorMessage(),
                    applicationCvId,
                    generation.getModelId(),
                    generation.getWorkflowVersion(),
                    generation.getCreatedAt(),
                    generation.getUpdatedAt(),
                    generation.getStartedAt(),
                    generation.getCompletedAt(),
                    "/api/v1/cv-generations/" + generation.getCvGenerationId());
        }
    }

    public record ConsentRequest(boolean accepted) {}

    public record ConsentResponse(String consentVersion, OffsetDateTime consentedAt, boolean current) {}
}
