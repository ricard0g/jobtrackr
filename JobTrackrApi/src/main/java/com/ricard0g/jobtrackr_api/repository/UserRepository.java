package com.ricard0g.jobtrackr_api.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ricard0g.jobtrackr_api.model.User;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByUserEmail(String userEmail);

    boolean existsByUserEmail(String userEmail);
}
