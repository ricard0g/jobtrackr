package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "user_email", nullable = false, unique = true, length = 255, columnDefinition = "CITEXT")
    private String userEmail;

    @Column(name = "user_password_hash", length = 255)
    private String userPasswordHash;

    @Column(name = "user_email_verified", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean userEmailVerified = false;

    @Column(name = "user_display_name", length = 160)
    private String userDisplayName;

    @Column(name = "user_picture_url", columnDefinition = "TEXT")
    private String userPictureUrl;

    @Column(name = "user_enabled", nullable = false, columnDefinition = "BOOLEAN DEFAULT TRUE")
    private boolean userEnabled = true;

    @Column(name = "user_locked", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean userLocked = false;

    @Column(name = "user_deleted_at", columnDefinition = "TIMESTAMPTZ")
    private OffsetDateTime userDeletedAt;

    @Column(name = "user_password_changed_at", columnDefinition = "TIMESTAMPTZ")
    private OffsetDateTime userPasswordChangedAt;

    @Column(name = "user_last_login_at", columnDefinition = "TIMESTAMPTZ")
    private OffsetDateTime userLastLoginAt;

    @CreationTimestamp
    @Column(name = "user_created_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMPTZ DEFAULT NOW()")
    private OffsetDateTime userCreatedAt;

    @UpdateTimestamp
    @Column(name = "user_updated_at", nullable = false, columnDefinition = "TIMESTAMPTZ DEFAULT NOW()")
    private OffsetDateTime userUpdatedAt;

    public static User localAccount(
            final String email,
            final String passwordHash,
            final String displayName) {
        final User user = new User();
        user.setUserEmail(email);
        user.setUserPasswordHash(passwordHash);
        user.setUserDisplayName(displayName);
        return user;
    }
}
