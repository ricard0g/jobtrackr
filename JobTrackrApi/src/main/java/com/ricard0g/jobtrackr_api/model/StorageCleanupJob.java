package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "storage_cleanup_jobs")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StorageCleanupJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "storage_cleanup_job_id")
    private Long storageCleanupJobId;

    @Column(name = "storage_cleanup_object_key", nullable = false, length = 512)
    private String objectKey;

    @Column(name = "storage_cleanup_attempts", nullable = false)
    private int attempts;

    @Column(name = "storage_cleanup_next_attempt_at", nullable = false)
    private OffsetDateTime nextAttemptAt;

    @Column(name = "storage_cleanup_last_error", length = 256)
    private String lastError;

    @CreationTimestamp
    @Column(name = "storage_cleanup_created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "storage_cleanup_completed_at")
    private OffsetDateTime completedAt;

    public static StorageCleanupJob create(final String objectKey) {
        final StorageCleanupJob job = new StorageCleanupJob();
        job.objectKey = objectKey;
        job.attempts = 0;
        job.nextAttemptAt = OffsetDateTime.now();
        return job;
    }
}
