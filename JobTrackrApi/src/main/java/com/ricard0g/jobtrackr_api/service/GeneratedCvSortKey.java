package com.ricard0g.jobtrackr_api.service;

import java.util.Arrays;

import org.springframework.data.domain.Sort;

public enum GeneratedCvSortKey {
    NAME("name", "originalFilename"),
    TYPE("type", "format"),
    SIZE("size", "byteSize"),
    CREATED("created", "createdAt"),
    VERSION("version", "version"),
    COMPANY("company", "application.company.companyName");

    private static final String IDENTIFIER_PROPERTY = "applicationCvId";

    private final String publicKey;
    private final String persistenceProperty;

    GeneratedCvSortKey(final String publicKey, final String persistenceProperty) {
        this.publicKey = publicKey;
        this.persistenceProperty = persistenceProperty;
    }

    public static GeneratedCvSortKey fromPublicKey(final String publicKey) {
        return Arrays.stream(values())
                .filter(sortKey -> sortKey.publicKey.equals(publicKey))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown Generated CV sort key"));
    }

    public Sort toSort(final Sort.Direction direction) {
        return Sort.by(
                new Sort.Order(direction, persistenceProperty),
                new Sort.Order(direction, IDENTIFIER_PROPERTY));
    }
}
