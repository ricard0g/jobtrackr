package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "job_descriptions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JobDescription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "job_description_id")
    private Long jobDescriptionId;

    @OneToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "job_description_application_id", nullable = false, unique = true)
    private Application application;

    @Column(name = "job_description_text", nullable = false, columnDefinition = "TEXT")
    private String jobDescriptionText;

    @CreationTimestamp
    @Column(name = "job_description_fetched_at", nullable = false, updatable = false)
    private OffsetDateTime jobDescriptionFetchedAt;
}
