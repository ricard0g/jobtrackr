package com.ricard0g.jobtrackr_api.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ricard0g.jobtrackr_api.model.BaseCv;

public interface BaseCvRepository extends JpaRepository<BaseCv, Long> {

    List<BaseCv> findAllByUser_UserIdOrderByCreatedAtDesc(UUID userId);

    Optional<BaseCv> findByBaseCvIdAndUser_UserId(Long baseCvId, UUID userId);

    long countByUser_UserId(UUID userId);

    boolean existsByUser_UserIdAndSha256(UUID userId, String sha256);
}
