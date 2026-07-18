package com.ricard0g.jobtrackr_api.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ricard0g.jobtrackr_api.model.JobDescription;

public interface JobDescriptionRepository extends JpaRepository<JobDescription, Long> {

    Optional<JobDescription> findByApplication_ApplicationId(Long applicationId);
}
