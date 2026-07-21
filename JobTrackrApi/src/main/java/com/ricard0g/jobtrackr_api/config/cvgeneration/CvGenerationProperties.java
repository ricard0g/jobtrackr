package com.ricard0g.jobtrackr_api.config.cvgeneration;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jobtrackr.cv-generation")
public record CvGenerationProperties(
        String serviceBaseUrl,
        String serviceToken,
        Duration requestTimeout,
        int workerConcurrency,
        long workerPollMs,
        Duration leaseDuration,
        int maxAttempts,
        int maxCleanupAttempts,
        int maxApplicationCvs,
        int maxJobDescriptionChars,
        int maxAdditionalInfoChars,
        String consentVersion,
        int purgeFailedAfterDays) {

    public CvGenerationProperties {
        if (serviceBaseUrl == null || serviceBaseUrl.isBlank()) {
            serviceBaseUrl = "http://localhost:8081";
        }
        if (serviceToken == null) {
            serviceToken = "";
        }
        if (requestTimeout == null) {
            requestTimeout = Duration.ofMinutes(5);
        }
        if (workerConcurrency <= 0) {
            workerConcurrency = 1;
        }
        if (workerPollMs <= 0) {
            workerPollMs = 2000L;
        }
        // Must exceed requestTimeout plus download/finalize slack so leases are not reclaimed mid-call.
        if (leaseDuration == null) {
            leaseDuration = Duration.ofMinutes(15);
        }
        if (maxAttempts <= 0) {
            maxAttempts = 3;
        }
        if (maxCleanupAttempts <= 0) {
            maxCleanupAttempts = 10;
        }
        if (maxApplicationCvs <= 0) {
            maxApplicationCvs = 20;
        }
        if (maxJobDescriptionChars <= 0) {
            maxJobDescriptionChars = 50_000;
        }
        if (maxAdditionalInfoChars <= 0) {
            maxAdditionalInfoChars = 5_000;
        }
        if (consentVersion == null || consentVersion.isBlank()) {
            consentVersion = "v1";
        }
        if (purgeFailedAfterDays <= 0) {
            purgeFailedAfterDays = 15;
        }
    }
}
