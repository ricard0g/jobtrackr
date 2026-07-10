package com.ricard0g.jobtrackr_api.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.Interview;
import com.ricard0g.jobtrackr_api.model.enums.InterviewOutcome;

public interface InterviewRepository extends JpaRepository<Interview, Long> {

    @Query(
            """
            SELECT i FROM Interview i
            WHERE i.application.applicationId = :applicationId
              AND i.application.user.userId = :userId
            ORDER BY i.interviewScheduledAt ASC
            """)
    List<Interview> findAllForApplicationAndUser(
            @Param("applicationId") Long applicationId, @Param("userId") UUID userId);

    @Query(
            """
            SELECT i FROM Interview i
            WHERE i.interviewId = :interviewId
              AND i.application.applicationId = :applicationId
              AND i.application.user.userId = :userId
            """)
    Optional<Interview> findForApplicationAndUser(
            @Param("interviewId") Long interviewId,
            @Param("applicationId") Long applicationId,
            @Param("userId") UUID userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
            """
            UPDATE Interview i
            SET i.interviewOutcome = :outcome,
                i.interviewUpdatedAt = CURRENT_TIMESTAMP
            WHERE i.interviewId = :interviewId
              AND i.application.applicationId = :applicationId
              AND i.application.user.userId = :userId
            """)
    int updateInterviewOutcomeForApplicationAndUser(
            @Param("interviewId") Long interviewId,
            @Param("applicationId") Long applicationId,
            @Param("userId") UUID userId,
            @Param("outcome") InterviewOutcome outcome);
}
