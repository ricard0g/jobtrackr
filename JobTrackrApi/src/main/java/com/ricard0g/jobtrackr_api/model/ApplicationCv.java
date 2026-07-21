package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;

import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
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
    private Integer version;

    @Column(name = "application_cv_object_key", nullable = false, unique = true, length = 512)
    private String objectKey;

    @Column(name = "application_cv_original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Enumerated(EnumType.STRING)
    @Column(name = "application_cv_format", nullable = false, length = 16)
    private GeneratedCvFormat format;

    @Column(name = "application_cv_content_type", nullable = false, length = 128)
    private String contentType;

    @Column(name = "application_cv_byte_size", nullable = false)
    private long byteSize;

    @Column(name = "application_cv_sha256", nullable = false, length = 64)
    private String sha256;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "application_cv_generation_id")
    private CvGeneration generation;

    @CreationTimestamp
    @Column(name = "application_cv_created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static ApplicationCv create(
            final Application application,
            final Integer version,
            final String objectKey,
            final String originalFilename,
            final GeneratedCvFormat format,
            final String contentType,
            final long byteSize,
            final String sha256,
            final CvGeneration generation) {
        final ApplicationCv applicationCv = new ApplicationCv();
        applicationCv.application = application;
        applicationCv.version = version;
        applicationCv.objectKey = objectKey;
        applicationCv.originalFilename = originalFilename;
        applicationCv.format = format;
        applicationCv.contentType = contentType;
        applicationCv.byteSize = byteSize;
        applicationCv.sha256 = sha256;
        applicationCv.generation = generation;
        return applicationCv;
    }
}
