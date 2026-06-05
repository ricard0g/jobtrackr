package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import com.ricard0g.jobtrackr_api.model.enums.InterviewOutcome;
import com.ricard0g.jobtrackr_api.model.enums.InterviewType;

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
        name = "interviews",
        indexes =
                @Index(
                        name = "idx_interviews_application_date",
                        columnList = "interview_application_id, interview_scheduled_at"))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Interview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "interview_id")
    private Long interviewId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "interview_application_id", nullable = false)
    private Application application;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "interview_type", nullable = false)
    private InterviewType interviewType;

    @Column(name = "interview_scheduled_at", nullable = false)
    private OffsetDateTime interviewScheduledAt;

    @Column(name = "interview_location", length = 255)
    private String interviewLocation;

    @Column(name = "interview_notes", columnDefinition = "TEXT")
    private String interviewNotes;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "interview_outcome", nullable = false)
    private InterviewOutcome interviewOutcome = InterviewOutcome.PENDING;

    @CreationTimestamp
    @Column(name = "interview_created_at", nullable = false, updatable = false)
    private OffsetDateTime interviewCreatedAt;

    @UpdateTimestamp
    @Column(name = "interview_updated_at", nullable = false)
    private OffsetDateTime interviewUpdatedAt;

    public static Interview create(
            final Application application,
            final InterviewType interviewType,
            final OffsetDateTime interviewScheduledAt,
            final String interviewLocation,
            final String interviewNotes) {
        final Interview interview = new Interview();
        interview.setApplication(application);
        interview.setInterviewType(interviewType);
        interview.setInterviewScheduledAt(interviewScheduledAt);
        interview.setInterviewLocation(interviewLocation);
        interview.setInterviewNotes(interviewNotes);
        interview.setInterviewOutcome(InterviewOutcome.PENDING);
        return interview;
    }
}
