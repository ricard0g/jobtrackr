package com.ricard0g.jobtrackr_api.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.model.enums.RemoteType;

import jakarta.persistence.CheckConstraint;
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
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(
        name = "applications",
        check = {
            @CheckConstraint(
                    name = "application_salary_range_valid",
                    constraint =
                            "application_salary_min IS NULL OR application_salary_max IS NULL OR application_salary_max >= application_salary_min")
        },
        indexes = {
            @Index(name = "idx_applications_user_status", columnList = "application_user_id, application_status"),
            @Index(name = "idx_applications_company", columnList = "application_company_id")
        })
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Application {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "application_id")
    private Long applicationId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "application_user_id", nullable = false)
    private User user;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "application_company_id", nullable = false)
    private Company company;

    @Column(name = "application_title", nullable = false, length = 255)
    private String applicationTitle;

    @Column(name = "application_job_url", length = 1024)
    private String applicationJobUrl;

    @Column(name = "application_location", length = 255)
    private String applicationLocation;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "application_remote_type")
    private RemoteType applicationRemoteType;

    @Column(name = "application_source", length = 255)
    private String applicationSource;

    @Column(name = "application_salary_min", precision = 12, scale = 2)
    private BigDecimal applicationSalaryMin;

    @Column(name = "application_salary_max", precision = 12, scale = 2)
    private BigDecimal applicationSalaryMax;

    @Column(name = "application_currency", length = 3)
    private String applicationCurrency;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "application_status", nullable = false)
    private ApplicationStatus applicationStatus;

    @Column(name = "application_kanban_order", nullable = false)
    private Integer applicationKanbanOrder = 0;

    @Column(name = "application_applied_at")
    private OffsetDateTime applicationAppliedAt;

    @CreationTimestamp
    @Column(name = "application_created_at", nullable = false, updatable = false)
    private OffsetDateTime applicationCreatedAt;

    @UpdateTimestamp
    @Column(name = "application_updated_at", nullable = false)
    private OffsetDateTime applicationUpdatedAt;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "application_tags",
            joinColumns = @JoinColumn(name = "application_tags_application_id"),
            inverseJoinColumns = @JoinColumn(name = "application_tags_tag_id"))
    private Set<Tag> tags = new HashSet<>();

    public static Application create(
            final User user,
            final Company company,
            final String applicationTitle,
            final ApplicationStatus applicationStatus,
            final Integer applicationKanbanOrder,
            final String applicationJobUrl,
            final String applicationLocation,
            final RemoteType applicationRemoteType,
            final String applicationSource,
            final BigDecimal applicationSalaryMin,
            final BigDecimal applicationSalaryMax,
            final String applicationCurrency,
            final OffsetDateTime applicationAppliedAt,
            final Set<Tag> tags) {
        final Application application = new Application();
        application.setUser(user);
        application.setCompany(company);
        application.setApplicationTitle(applicationTitle);
        application.setApplicationStatus(applicationStatus);
        application.setApplicationKanbanOrder(applicationKanbanOrder != null ? applicationKanbanOrder : 0);
        application.setApplicationJobUrl(applicationJobUrl);
        application.setApplicationLocation(applicationLocation);
        application.setApplicationRemoteType(applicationRemoteType);
        application.setApplicationSource(applicationSource);
        application.setApplicationSalaryMin(applicationSalaryMin);
        application.setApplicationSalaryMax(applicationSalaryMax);
        application.setApplicationCurrency(applicationCurrency);
        application.setApplicationAppliedAt(applicationAppliedAt);
        application.setTags(tags != null ? tags : new HashSet<>());
        return application;
    }
}
