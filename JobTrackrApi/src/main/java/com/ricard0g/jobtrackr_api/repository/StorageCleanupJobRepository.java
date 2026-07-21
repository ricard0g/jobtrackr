package com.ricard0g.jobtrackr_api.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.StorageCleanupJob;

public interface StorageCleanupJobRepository extends JpaRepository<StorageCleanupJob, Long> {

    @Query(
            value =
                    """
                    SELECT storage_cleanup_job_id
                    FROM storage_cleanup_jobs
                    WHERE storage_cleanup_completed_at IS NULL
                      AND storage_cleanup_next_attempt_at <= :now
                    ORDER BY storage_cleanup_next_attempt_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                    """,
            nativeQuery = true)
    Optional<Long> claimNextJobId(@Param("now") OffsetDateTime now);

    List<StorageCleanupJob> findByObjectKeyAndCompletedAtIsNull(String objectKey);
}
