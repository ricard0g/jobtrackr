package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.UpdateTimestamp;

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
@Table(name = "cv_base")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CvBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "cv_base_id")
    private Long cvBaseId;

    @OneToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "cv_base_user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "cv_base_location", nullable = false, length = 1024)
    private String cvBaseLocation;

    @UpdateTimestamp
    @Column(name = "cv_base_updated_at", nullable = false)
    private OffsetDateTime cvBaseUpdatedAt;
}
