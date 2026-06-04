package com.ricard0g.jobtrackr_api.model;

import java.time.OffsetDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import com.fasterxml.jackson.databind.JsonNode;

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
        name = "saved_views",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "idx_saved_views_user_name",
                        columnNames = {"saved_view_user_id", "saved_view_name"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SavedView {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "saved_view_id")
    private Long savedViewId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "saved_view_user_id", nullable = false)
    private User user;

    @Column(name = "saved_view_name", nullable = false, length = 255)
    private String savedViewName;

    @Column(name = "saved_view_is_default", nullable = false)
    private boolean savedViewIsDefault = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "saved_view_filters_json", nullable = false, columnDefinition = "jsonb")
    private JsonNode savedViewFiltersJson;

    @CreationTimestamp
    @Column(name = "saved_view_created_at", nullable = false, updatable = false)
    private OffsetDateTime savedViewCreatedAt;

    @UpdateTimestamp
    @Column(name = "saved_view_updated_at", nullable = false)
    private OffsetDateTime savedViewUpdatedAt;
}
