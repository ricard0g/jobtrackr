package com.ricard0g.jobtrackr_api.security.oauth;

import java.util.Set;

public final class OAuthRedirects {

    public static final String RESULT_QUERY_PARAM = "oauthResult";
    public static final String CREATE_PASSWORD_QUERY_PARAM = "createPassword";

    private static final Set<String> ALLOWED_RETURN_TO = Set.of(
            "/",
            "/documents",
            "/settings/account");
    private static final Set<String> ALLOWED_FAILURE_PATHS = Set.of(
            OAuthSession.LOGIN_FAILURE_PATH,
            OAuthSession.REGISTER_FAILURE_PATH,
            OAuthSession.ACCOUNT_SETTINGS_PATH);

    private OAuthRedirects() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }

    public static String sanitizeReturnTo(final String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return OAuthSession.DEFAULT_RETURN_TO;
        }
        if (ALLOWED_RETURN_TO.contains(candidate)) {
            return candidate;
        }
        return OAuthSession.DEFAULT_RETURN_TO;
    }

    public static String sanitizeFailurePath(final String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return OAuthSession.LOGIN_FAILURE_PATH;
        }
        if (ALLOWED_FAILURE_PATHS.contains(candidate)) {
            return candidate;
        }
        return OAuthSession.LOGIN_FAILURE_PATH;
    }

    public static String failurePathForScreen(final String screen) {
        if ("register".equals(screen)) {
            return OAuthSession.REGISTER_FAILURE_PATH;
        }
        return OAuthSession.LOGIN_FAILURE_PATH;
    }

    public static String successLocation(final String publicOrigin, final String returnTo) {
        return publicOrigin + sanitizeReturnTo(returnTo);
    }

    public static String createPasswordGrantLocation(final String publicOrigin) {
        return publicOrigin + OAuthSession.ACCOUNT_SETTINGS_PATH + "?" + CREATE_PASSWORD_QUERY_PARAM + "=1";
    }

    public static String failureLocation(
            final String publicOrigin,
            final String failurePath,
            final OAuthResultCode resultCode) {
        return publicOrigin
                + sanitizeFailurePath(failurePath)
                + "?"
                + RESULT_QUERY_PARAM
                + "="
                + resultCode.queryValue();
    }
}
