package com.ricard0g.jobtrackr_api.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;

public interface UserIdentityRepository extends JpaRepository<UserIdentity, UUID> {

    @Query("""
            SELECT identity
            FROM UserIdentity identity
            JOIN FETCH identity.user user
            WHERE identity.provider = :provider
              AND identity.subject = :subject
            """)
    Optional<UserIdentity> findByProviderAndSubject(
            @Param("provider") IdentityProvider provider,
            @Param("subject") String subject);

    Optional<UserIdentity> findByUser_UserIdAndProvider(UUID userId, IdentityProvider provider);
}
