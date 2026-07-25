package com.ricard0g.jobtrackr_api.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.ApplicationCv;

public interface ApplicationCvRepository extends JpaRepository<ApplicationCv, Long> {

    List<ApplicationCv> findAllByApplication_ApplicationIdAndApplication_User_UserIdOrderByVersionDesc(
            Long applicationId, UUID userId);

    Optional<ApplicationCv> findByApplicationCvIdAndApplication_User_UserId(Long applicationCvId, UUID userId);

    long countByApplication_ApplicationId(Long applicationId);

    @Query(
            """
            SELECT COALESCE(MAX(cv.version), 0)
            FROM ApplicationCv cv
            WHERE cv.application.applicationId = :applicationId
            """)
    int findMaxVersion(@Param("applicationId") Long applicationId);

    List<ApplicationCv> findAllByApplication_ApplicationId(Long applicationId);

    @Query(
            value =
                    """
                    SELECT cv
                    FROM ApplicationCv cv
                    JOIN FETCH cv.application application
                    JOIN FETCH application.company
                    LEFT JOIN FETCH cv.generation
                    WHERE application.user.userId = :userId
                    """,
            countQuery =
                    """
                    SELECT COUNT(cv)
                    FROM ApplicationCv cv
                    WHERE cv.application.user.userId = :userId
                    """)
    Page<ApplicationCv> findAllByApplication_User_UserId(
            @Param("userId") UUID userId, Pageable pageable);
}
