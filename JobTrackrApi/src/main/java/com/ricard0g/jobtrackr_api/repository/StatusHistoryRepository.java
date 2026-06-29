package com.ricard0g.jobtrackr_api.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.StatusHistory;

public interface StatusHistoryRepository extends JpaRepository<StatusHistory, Long> {

    @Query(
            """
            SELECT sh FROM StatusHistory sh
            WHERE sh.application.applicationId = :applicationId
              AND sh.application.user.userId = :userId
            ORDER BY sh.statusHistoryChangedAt DESC
            """)
    List<StatusHistory> findAllForApplicationAndUser(
            @Param("applicationId") Long applicationId, @Param("userId") UUID userId);
}
