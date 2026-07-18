package com.ricard0g.jobtrackr_api.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.CvGeneration;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;

public interface CvGenerationRepository extends JpaRepository<CvGeneration, Long> {

    Optional<CvGeneration> findByCvGenerationIdAndUser_UserId(Long cvGenerationId, UUID userId);

    Optional<CvGeneration> findByUser_UserIdAndIdempotencyKey(UUID userId, String idempotencyKey);

    List<CvGeneration> findAllByUser_UserIdOrderByCreatedAtDesc(UUID userId);

    List<CvGeneration> findAllByApplication_ApplicationIdAndUser_UserIdOrderByCreatedAtDesc(
            Long applicationId, UUID userId);

    boolean existsByBaseCv_BaseCvIdAndStatusIn(Long baseCvId, List<CvGenerationStatus> statuses);

    @Query(
            value =
                    """
                    SELECT cv_generation_id
                    FROM cv_generations
                    WHERE (
                        cv_generation_status = 'PENDING'
                        AND cv_generation_next_attempt_at <= :now
                    )
                    OR (
                        cv_generation_status = 'PROCESSING'
                        AND cv_generation_lease_expires_at IS NOT NULL
                        AND cv_generation_lease_expires_at < :now
                    )
                    ORDER BY cv_generation_next_attempt_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                    """,
            nativeQuery = true)
    Optional<Long> claimNextGenerationId(@Param("now") OffsetDateTime now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
            """
            DELETE FROM CvGeneration g
            WHERE g.status IN :statuses
              AND g.completedAt IS NOT NULL
              AND g.completedAt < :cutoff
            """)
    int deleteTerminalOlderThan(
            @Param("statuses") List<CvGenerationStatus> statuses, @Param("cutoff") OffsetDateTime cutoff);

    List<CvGeneration> findAllByApplication_ApplicationIdAndStatusIn(
            Long applicationId, List<CvGenerationStatus> statuses);
}
