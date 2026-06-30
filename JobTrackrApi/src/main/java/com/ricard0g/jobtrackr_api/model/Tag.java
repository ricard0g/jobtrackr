package com.ricard0g.jobtrackr_api.model;

import java.util.HashSet;
import java.util.Set;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.ricard0g.jobtrackr_api.model.enums.TagCategory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "tags")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Tag {

    public static final String DEFAULT_TAG_COLOR = "#808080";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "tag_id")
    private Long tagId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tag_user_id")
    private User user;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "tag_category", nullable = false)
    private TagCategory tagCategory;

    @Column(name = "tag_name", nullable = false, length = 100)
    private String tagName;

    @Column(name = "tag_color", nullable = false, length = 7)
    private String tagColor = DEFAULT_TAG_COLOR;

    @ManyToMany(mappedBy = "tags", fetch = FetchType.LAZY)
    private Set<Application> applications = new HashSet<>();

    public boolean isGlobal() {
        return user == null;
    }

    public static Tag create(final TagCategory category, final String name, final String color) {
        final Tag tag = new Tag();
        tag.setTagCategory(category);
        tag.setTagName(name);
        final boolean hasColor = color != null && !color.isBlank();
        tag.setTagColor(hasColor ? color : DEFAULT_TAG_COLOR);
        return tag;
    }

    public static Tag create(final User user, final TagCategory category, final String name, final String color) {
        final Tag tag = create(category, name, color);
        tag.setUser(user);
        return tag;
    }
}
