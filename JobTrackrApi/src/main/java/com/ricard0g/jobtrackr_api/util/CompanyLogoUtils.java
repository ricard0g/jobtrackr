package com.ricard0g.jobtrackr_api.util;

import java.net.URI;

public final class CompanyLogoUtils {

    private static final String HUNTER_LOGO_BASE_URL = "https://logos.hunter.io/";

    private CompanyLogoUtils() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }

    public static String hunterLogoUrlFromWebsite(final String websiteUrl) {
        final String domain = extractDomain(websiteUrl);
        if (domain == null) {
            return null;
        }
        return HUNTER_LOGO_BASE_URL + domain;
    }

    private static String extractDomain(final String websiteUrl) {
        if (websiteUrl == null || websiteUrl.isBlank()) {
            return null;
        }
        final String normalizedUrl = websiteUrl.contains("://") ? websiteUrl : "https://" + websiteUrl;
        final URI uri = URI.create(normalizedUrl.trim());
        final String host = uri.getHost();
        if (host == null || host.isBlank()) {
            return null;
        }
        final String domain = host.startsWith("www.") ? host.substring(4) : host;
        return domain.isBlank() ? null : domain;
    }
}
