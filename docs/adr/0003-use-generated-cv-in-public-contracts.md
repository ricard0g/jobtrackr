# Use Generated CV in public contracts

The web application and HTTP API use the canonical term Generated CV, including `/generated-cvs` resources and `GeneratedCv` client types, while the existing `application_cvs` table and `ApplicationCv` JPA model retain their legacy names for now. This accepts a contained internal naming mismatch to align user-facing and integration contracts with the domain language without coupling the Documents preview feature to a persistence migration.
