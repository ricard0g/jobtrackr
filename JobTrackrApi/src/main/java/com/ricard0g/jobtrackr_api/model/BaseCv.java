package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;

import com.ricard0g.jobtrackr_api.model.enums.BaseCvFormat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "base_cvs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BaseCv {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "base_cv_id")
    private Long baseCvId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "base_cv_user_id", nullable = false)
    private User user;

    @Column(name = "base_cv_object_key", nullable = false, unique = true, length = 512)
    private String objectKey;

    @Column(name = "base_cv_original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Enumerated(EnumType.STRING)
    @Column(name = "base_cv_format", nullable = false, length = 16)
    private BaseCvFormat format;

    @Column(name = "base_cv_content_type", nullable = false, length = 128)
    private String contentType;

    @Column(name = "base_cv_byte_size", nullable = false)
    private long byteSize;

    @Column(name = "base_cv_sha256", nullable = false, length = 64)
    private String sha256;

    @CreationTimestamp
    @Column(name = "base_cv_created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static BaseCv create(
            final User user,
            final String objectKey,
            final String originalFilename,
            final BaseCvFormat format,
            final String contentType,
            final long byteSize,
            final String sha256) {
        final BaseCv baseCv = new BaseCv();
        baseCv.user = user;
        baseCv.objectKey = objectKey;
        baseCv.originalFilename = originalFilename;
        baseCv.format = format;
        baseCv.contentType = contentType;
        baseCv.byteSize = byteSize;
        baseCv.sha256 = sha256;
        return baseCv;
    }
}
