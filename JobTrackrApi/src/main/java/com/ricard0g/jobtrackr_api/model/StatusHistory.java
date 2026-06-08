package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;

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
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(
        name = "status_history",
        indexes =
                @Index(
                        name = "idx_status_history_application_date",
                        columnList = "status_history_application_id, status_history_changed_at"))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "status_history_id")
    private Long statusHistoryId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "status_history_application_id", nullable = false)
    private Application application;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status_history_old_status")
    private ApplicationStatus statusHistoryOldStatus;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status_history_new_status", nullable = false)
    private ApplicationStatus statusHistoryNewStatus;

    @CreationTimestamp
    @Column(name = "status_history_changed_at", nullable = false)
    private OffsetDateTime statusHistoryChangedAt;

    @CreationTimestamp
    @Column(name = "status_history_created_at", nullable = false, updatable = false)
    private OffsetDateTime statusHistoryCreatedAt;

    public static StatusHistory create(
            final Application application,
            final ApplicationStatus oldStatus,
            final ApplicationStatus newStatus) {
        final StatusHistory statusHistory = new StatusHistory();
        statusHistory.setApplication(application);
        statusHistory.setStatusHistoryOldStatus(oldStatus);
        statusHistory.setStatusHistoryNewStatus(newStatus);
        return statusHistory;
    }
}
