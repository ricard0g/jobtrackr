package com.ricard0g.jobtrackr_api.service;

import java.util.Objects;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

public record GeneratedCvListQuery(
        int page, int size, GeneratedCvSortKey sortKey, Sort.Direction direction) {

    public GeneratedCvListQuery {
        if (page < 0 || size < 1) {
            throw new IllegalArgumentException("Invalid Generated CV page");
        }
        Objects.requireNonNull(sortKey);
        Objects.requireNonNull(direction);
    }

    public static GeneratedCvListQuery fromPublicValues(
            final int page,
            final int size,
            final String sortKey,
            final String direction) {
        return new GeneratedCvListQuery(
                page,
                size,
                GeneratedCvSortKey.fromPublicKey(sortKey),
                Sort.Direction.fromString(direction));
    }

    public Pageable toPageable() {
        return PageRequest.of(page, size, sortKey.toSort(direction));
    }
}
