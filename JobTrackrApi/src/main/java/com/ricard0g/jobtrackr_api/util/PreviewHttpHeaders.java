package com.ricard0g.jobtrackr_api.util;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public final class PreviewHttpHeaders {

    public static final String CACHE_CONTROL = "private, no-store";

    private static final String UNSAFE_FILENAME_CHARS = "[\\\\/\"\\r\\n]";

    private PreviewHttpHeaders() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }

    public static String inlineContentDisposition(final String originalFilename) {
        final String safeFilename = originalFilename.replaceAll(UNSAFE_FILENAME_CHARS, "_");
        final String encodedFilename = URLEncoder.encode(originalFilename, StandardCharsets.UTF_8)
                .replace("+", "%20");
        return "inline; filename=\"" + safeFilename + "\"; filename*=UTF-8''" + encodedFilename;
    }
}
