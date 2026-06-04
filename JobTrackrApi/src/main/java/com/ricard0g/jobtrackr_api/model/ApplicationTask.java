package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import com.ricard0g.jobtrackr_api.model.enums.TaskType;

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
        name = "application_tasks",
        indexes = {
            @Index(
                    name = "idx_application_tasks_application_due",
                    columnList = "application_task_application_id, application_task_due_at"),
            @Index(
                    name = "idx_application_tasks_due_completed",
                    columnList = "application_task_due_at, application_task_completed_at")
        })
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "application_task_id")
    private Long applicationTaskId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "application_task_application_id", nullable = false)
    private Application application;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "application_task_type", nullable = false)
    private TaskType applicationTaskType;

    @Column(name = "application_task_title", nullable = false, length = 255)
    private String applicationTaskTitle;

    @Column(name = "application_task_description", columnDefinition = "TEXT")
    private String applicationTaskDescription;

    @Column(name = "application_task_due_at", nullable = false)
    private OffsetDateTime applicationTaskDueAt;

    @Column(name = "application_task_completed_at")
    private OffsetDateTime applicationTaskCompletedAt;

    @CreationTimestamp
    @Column(name = "application_task_created_at", nullable = false, updatable = false)
    private OffsetDateTime applicationTaskCreatedAt;

    @UpdateTimestamp
    @Column(name = "application_task_updated_at", nullable = false)
    private OffsetDateTime applicationTaskUpdatedAt;
}
