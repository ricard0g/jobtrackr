package com.ricard0g.jobtrackr_api.validation;

import java.nio.charset.StandardCharsets;

public final class PasswordPolicy {

    public static final int MIN_LENGTH = 8;
    public static final int MAX_UTF8_BYTES = 72;
    public static final String TOO_SHORT_MESSAGE = "Password must be at least " + MIN_LENGTH + " characters";
    public static final String TOO_LONG_MESSAGE = "Password must be at most " + MAX_UTF8_BYTES + " UTF-8 bytes";
    public static final String DEFAULT_MESSAGE =
            "Password must be at least " + MIN_LENGTH + " characters and at most " + MAX_UTF8_BYTES + " UTF-8 bytes";

    private PasswordPolicy() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }

    public static int utf8ByteLength(final String password) {
        return password.getBytes(StandardCharsets.UTF_8).length;
    }

    public static boolean isTooShort(final String password) {
        return password.length() < MIN_LENGTH;
    }

    public static boolean exceedsBcryptLimit(final String password) {
        return utf8ByteLength(password) > MAX_UTF8_BYTES;
    }
}
