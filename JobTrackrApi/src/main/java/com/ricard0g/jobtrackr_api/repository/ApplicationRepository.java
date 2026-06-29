package com.ricard0g.jobtrackr_api.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import com.ricard0g.jobtrackr_api.model.Application;

public interface ApplicationRepository extends JpaRepository<Application, Long> {

    @Query(
            """
            SELECT CASE WHEN COUNT(a) > 0 THEN true ELSE false END
            FROM Application a
            WHERE a.company.companyId = :companyId
            """)
    boolean hasApplications(@Param("companyId") Long companyId);

    @Query(
            """
            SELECT DISTINCT a FROM Application a
            JOIN FETCH a.company
            JOIN FETCH a.tags
            WHERE a.user.userId = :userId
            ORDER BY a.applicationKanbanOrder ASC, a.applicationCreatedAt DESC
            """)
    List<Application> findAllForUser(@Param("userId") UUID userId);

    @Query(
            """
            SELECT a FROM Application a
            JOIN FETCH a.company
            JOIN FETCH a.tags
            WHERE a.applicationId = :applicationId AND a.user.userId = :userId
            """)
    Optional<Application> findForUser(
            @Param("applicationId") Long applicationId, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
            """
            SELECT a FROM Application a
            WHERE a.applicationId = :applicationId AND a.user.userId = :userId
            """)
    Optional<Application> findForUserWithLock(
            @Param("applicationId") Long applicationId, @Param("userId") UUID userId);

    @Query(
            """
            SELECT CASE WHEN COUNT(a) > 0 THEN true ELSE false END
            FROM Application a
            WHERE a.applicationId = :applicationId AND a.user.userId = :userId
            """)
    boolean existsForUser(@Param("applicationId") Long applicationId, @Param("userId") UUID userId);
}
