package com.ricard0g.jobtrackr_api.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.Application;

public interface ApplicationRepository extends JpaRepository<Application, Long> {

    @Query(
            """
            SELECT CASE WHEN COUNT(a) > 0 THEN true ELSE false END
            FROM Application a
            WHERE a.company.companyId = :companyId
            """)
    boolean hasApplications(@Param("companyId") Long companyId);
}
