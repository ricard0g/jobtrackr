package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
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
        name = "companies",
        uniqueConstraints = @UniqueConstraint(columnNames = {"company_user_id", "company_name"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "company_id")
    private Long companyId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_user_id", nullable = false)
    private User user;

    @Column(name = "company_name", nullable = false, length = 255)
    private String companyName;

    @Column(name = "company_website_url", length = 1024)
    private String companyWebsiteUrl;

    @Column(name = "company_location", length = 255)
    private String companyLocation;

    @Column(name = "company_type", length = 100)
    private String companyType;

    @Column(name = "company_logo", length = 1024)
    private String companyLogo;

    @CreationTimestamp
    @Column(name = "company_created_at", nullable = false, updatable = false)
    private OffsetDateTime companyCreatedAt;

    @UpdateTimestamp
    @Column(name = "company_updated_at", nullable = false)
    private OffsetDateTime companyUpdatedAt;
}
