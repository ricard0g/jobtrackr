package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
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
        name = "application_cvs",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_application_cvs_version",
                        columnNames = {"application_cv_application_id", "application_cv_version"}),
        indexes = @Index(name = "idx_application_cvs_application", columnList = "application_cv_application_id"))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationCv {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "application_cv_id")
    private Long applicationCvId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "application_cv_application_id", nullable = false)
    private Application application;

    @Column(name = "application_cv_version", nullable = false)
    private Integer applicationCvVersion;

    @Column(name = "application_cv_location", nullable = false, length = 1024)
    private String applicationCvLocation;

    @Column(name = "application_cv_tone", length = 50)
    private String applicationCvTone;

    @CreationTimestamp
    @Column(name = "application_cv_created_at", nullable = false, updatable = false)
    private OffsetDateTime applicationCvCreatedAt;
}
