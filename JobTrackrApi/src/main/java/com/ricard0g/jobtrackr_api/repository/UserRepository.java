package com.ricard0g.jobtrackr_api.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ricard0g.jobtrackr_api.model.User;

public interface UserRepository extends JpaRepository<User, Long> {
}
