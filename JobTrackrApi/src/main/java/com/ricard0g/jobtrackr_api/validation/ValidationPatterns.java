package com.ricard0g.jobtrackr_api.validation;

public final class ValidationPatterns {

    public static final String OPTIONAL_HTTP_URL = "^(|https?://\\S+)$";

    private ValidationPatterns() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }
}
