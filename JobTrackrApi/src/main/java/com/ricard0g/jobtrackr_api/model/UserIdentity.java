package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.hibernate.annotations.UuidGenerator;

import com.ricard0g.jobtrackr_api.model.enums.IdentityProvider;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(
        name = "user_identities",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_user_identities_provider_subject",
                        columnNames = {"identity_provider", "identity_subject"}),
                @UniqueConstraint(
                        name = "uk_user_identities_user_provider",
                        columnNames = {"identity_user_id", "identity_provider"})
        })
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserIdentity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "identity_id", nullable = false, updatable = false)
    private UUID identityId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "identity_user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "identity_provider", nullable = false, length = 32)
    private IdentityProvider provider;

    @Column(name = "identity_subject", nullable = false, length = 255)
    private String subject;

    @Column(name = "identity_provider_email", nullable = false, length = 255, columnDefinition = "CITEXT")
    private String providerEmail;

    @Column(name = "identity_linked_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMPTZ")
    private OffsetDateTime linkedAt;

    @Column(name = "identity_last_used_at", nullable = false, columnDefinition = "TIMESTAMPTZ")
    private OffsetDateTime lastUsedAt;

    public static UserIdentity googleIdentity(
            final User user,
            final String subject,
            final String providerEmail,
            final OffsetDateTime linkedAt) {
        final UserIdentity identity = new UserIdentity();
        identity.setUser(user);
        identity.setProvider(IdentityProvider.GOOGLE);
        identity.setSubject(subject);
        identity.setProviderEmail(providerEmail);
        identity.setLinkedAt(linkedAt);
        identity.setLastUsedAt(linkedAt);
        return identity;
    }

    public void recordSuccessfulUse(final String verifiedProviderEmail, final OffsetDateTime usedAt) {
        lastUsedAt = usedAt;
        if (!providerEmail.equalsIgnoreCase(verifiedProviderEmail)) {
            providerEmail = verifiedProviderEmail;
        }
    }
}
