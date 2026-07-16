package com.ricard0g.jobtrackr_api.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import com.ricard0g.jobtrackr_api.model.User;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByUserEmail(String userEmail);

    boolean existsByUserEmail(String userEmail);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.userId = :userId")
    Optional<User> findByIdForUpdate(@Param("userId") UUID userId);
}
