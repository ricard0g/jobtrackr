package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(
        name = "cv_generations",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_cv_generations_user_idempotency",
                        columnNames = {"cv_generation_user_id", "cv_generation_idempotency_key"}),
        indexes = {
            @Index(name = "idx_cv_generations_application", columnList = "cv_generation_application_id"),
            @Index(name = "idx_cv_generations_user", columnList = "cv_generation_user_id"),
            @Index(
                    name = "idx_cv_generations_claim",
                    columnList =
                            "cv_generation_status, cv_generation_next_attempt_at, cv_generation_lease_expires_at")
        })
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CvGeneration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "cv_generation_id")
    private Long cvGenerationId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "cv_generation_user_id", nullable = false)
    private User user;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "cv_generation_application_id", nullable = false)
    private Application application;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cv_generation_base_cv_id")
    private BaseCv baseCv;

    @Column(name = "cv_generation_idempotency_key", nullable = false, length = 128)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "cv_generation_requested_format", nullable = false, length = 16)
    private GeneratedCvFormat requestedFormat;

    @Column(name = "cv_generation_job_description_snapshot", nullable = false, columnDefinition = "TEXT")
    private String jobDescriptionSnapshot;

    @Column(name = "cv_generation_additional_info_snapshot", columnDefinition = "TEXT")
    private String additionalInfoSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "cv_generation_status", nullable = false, length = 32)
    private CvGenerationStatus status;

    @Column(name = "cv_generation_attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "cv_generation_max_attempts", nullable = false)
    private int maxAttempts;

    @Column(name = "cv_generation_lease_owner", length = 128)
    private String leaseOwner;

    @Column(name = "cv_generation_lease_expires_at")
    private OffsetDateTime leaseExpiresAt;

    @Column(name = "cv_generation_next_attempt_at", nullable = false)
    private OffsetDateTime nextAttemptAt;

    @Column(name = "cv_generation_error_code", length = 64)
    private String errorCode;

    @Column(name = "cv_generation_error_message", length = 512)
    private String errorMessage;

    @Column(name = "cv_generation_correlation_id", nullable = false)
    private UUID correlationId;

    @Column(name = "cv_generation_model_id", length = 128)
    private String modelId;

    @Column(name = "cv_generation_workflow_version", length = 64)
    private String workflowVersion;

    @Column(name = "cv_generation_consent_version", nullable = false, length = 32)
    private String consentVersion;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cv_generation_application_cv_id")
    private ApplicationCv applicationCv;

    @CreationTimestamp
    @Column(name = "cv_generation_created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "cv_generation_updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "cv_generation_started_at")
    private OffsetDateTime startedAt;

    @Column(name = "cv_generation_completed_at")
    private OffsetDateTime completedAt;

    public static CvGeneration create(
            final User user,
            final Application application,
            final BaseCv baseCv,
            final String idempotencyKey,
            final GeneratedCvFormat requestedFormat,
            final String jobDescriptionSnapshot,
            final String additionalInfoSnapshot,
            final String consentVersion,
            final int maxAttempts) {
        final CvGeneration generation = new CvGeneration();
        generation.user = user;
        generation.application = application;
        generation.baseCv = baseCv;
        generation.idempotencyKey = idempotencyKey;
        generation.requestedFormat = requestedFormat;
        generation.jobDescriptionSnapshot = jobDescriptionSnapshot;
        generation.additionalInfoSnapshot = additionalInfoSnapshot;
        generation.status = CvGenerationStatus.PENDING;
        generation.attemptCount = 0;
        generation.maxAttempts = maxAttempts;
        generation.nextAttemptAt = OffsetDateTime.now();
        generation.correlationId = UUID.randomUUID();
        generation.consentVersion = consentVersion;
        return generation;
    }
}
