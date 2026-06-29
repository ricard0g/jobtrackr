package com.ricard0g.jobtrackr_api.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.Company;

public interface CompanyRepository extends JpaRepository<Company, Long> {

    @Query(
            """
            SELECT c FROM Company c
            WHERE c.user.userId = :userId
            ORDER BY c.companyName ASC
            """)
    List<Company> findAllForUser(@Param("userId") UUID userId);

    @Query(
            """
            SELECT c FROM Company c
            WHERE c.companyId = :companyId AND c.user.userId = :userId
            """)
    Optional<Company> findForUser(@Param("companyId") Long companyId, @Param("userId") UUID userId);

    @Query(
            """
            SELECT CASE WHEN COUNT(c) > 0 THEN true ELSE false END
            FROM Company c
            WHERE c.user.userId = :userId
              AND LOWER(c.companyName) = LOWER(:companyName)
            """)
    boolean nameExistsForUser(@Param("userId") UUID userId, @Param("companyName") String companyName);

    @Query(
            """
            SELECT CASE WHEN COUNT(c) > 0 THEN true ELSE false END
            FROM Company c
            WHERE c.user.userId = :userId
              AND LOWER(c.companyName) = LOWER(:companyName)
              AND c.companyId <> :companyId
            """)
    boolean nameExistsForUserExcludingCompany(
            @Param("userId") UUID userId,
            @Param("companyName") String companyName,
            @Param("companyId") Long companyId);
}
