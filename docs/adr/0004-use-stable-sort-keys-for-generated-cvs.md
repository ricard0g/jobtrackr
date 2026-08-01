# Use stable public sort keys for Generated CVs

The Generated CV library uses server-side sorting and pagination with validated public sort keys such as `name`, `type`, `size`, `created`, `version`, and `company`. The API maps those keys to persistence fields and adds a unique-ID tie-breaker, keeping pagination deterministic without coupling web clients to Spring Data or JPA property paths.
