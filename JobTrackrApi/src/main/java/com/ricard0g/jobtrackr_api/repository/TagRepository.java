package com.ricard0g.jobtrackr_api.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ricard0g.jobtrackr_api.model.Tag;

public interface TagRepository extends JpaRepository<Tag, Long> {

    @Query(
            """
            SELECT t FROM Tag t
            WHERE t.user IS NULL OR t.user.userId = :userId
            ORDER BY t.tagName ASC
            """)
    List<Tag> findAllGlobalAndByUserId(@Param("userId") UUID userId);

    @Query(
            """
            SELECT t FROM Tag t
            WHERE t.tagId = :tagId AND (t.user IS NULL OR t.user.userId = :userId)
            """)
    Optional<Tag> findByTagIdAndAccessibleToUser(@Param("tagId") Long tagId, @Param("userId") UUID userId);

    @Query(
            """
            SELECT t FROM Tag t
            WHERE t.tagId = :tagId AND t.user.userId = :userId
            """)
    Optional<Tag> findByTagIdAndUser_UserId(@Param("tagId") Long tagId, @Param("userId") UUID userId);

    @Query(
            """
            SELECT CASE WHEN COUNT(t) > 0 THEN true ELSE false END
            FROM Tag t
            WHERE t.user IS NULL AND t.tagName = :tagName
            """)
    boolean existsGlobalByTagName(@Param("tagName") String tagName);

    boolean existsByTagNameAndUser_UserId(String tagName, UUID userId);

    @Query(
            """
            SELECT CASE WHEN COUNT(t) > 0 THEN true ELSE false END
            FROM Tag t
            WHERE t.user IS NULL AND t.tagName = :tagName AND t.tagId <> :tagId
            """)
    boolean existsGlobalByTagNameAndTagIdNot(@Param("tagName") String tagName, @Param("tagId") Long tagId);

    boolean existsByTagNameAndUser_UserIdAndTagIdNot(String tagName, UUID userId, Long tagId);

    @Query(
            """
            SELECT t FROM Tag t
            WHERE t.tagId IN :tagIds AND (t.user IS NULL OR t.user.userId = :userId)
            """)
    List<Tag> findAllAccessibleByUserAndTagIdIn(
            @Param("userId") UUID userId, @Param("tagIds") Collection<Long> tagIds);
}
