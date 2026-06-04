package com.ricard0g.jobtrackr_api.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ricard0g.jobtrackr_api.model.Tag;

public interface TagRepository extends JpaRepository<Tag, Long> {

    boolean existsByTagName(String tagName);
}
