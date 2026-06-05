package com.ricard0g.jobtrackr_api.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.Interview;

public interface InterviewRepository extends JpaRepository<Interview, Long> {

    @Query(
            """
            SELECT i FROM Interview i
            WHERE i.application.applicationId = :applicationId
              AND i.application.user.userId = :userId
            ORDER BY i.interviewScheduledAt ASC
            """)
    List<Interview> findAllForApplicationAndUser(
            @Param("applicationId") Long applicationId, @Param("userId") Long userId);

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
            @Param("userId") Long userId);
}
