package com.ricard0g.jobtrackr_api.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ricard0g.jobtrackr_api.model.StatusHistory;

public interface StatusHistoryRepository extends JpaRepository<StatusHistory, Long> {}
