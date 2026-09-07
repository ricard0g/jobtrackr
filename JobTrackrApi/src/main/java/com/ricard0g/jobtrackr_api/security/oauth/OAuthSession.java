package com.ricard0g.jobtrackr_api.security.oauth;

public final class OAuthSession {

    public static final String COOKIE_NAME = "JOBTRACKR_OAUTH_SESSION";
    public static final String COOKIE_PATH = "/api/v1";
    public static final String PURPOSE_ATTRIBUTE = "jobtrackr.oauth.purpose";
    public static final String USER_ID_ATTRIBUTE = "jobtrackr.oauth.userId";
    public static final String RETURN_TO_ATTRIBUTE = "jobtrackr.oauth.returnTo";
    public static final String FAILURE_PATH_ATTRIBUTE = "jobtrackr.oauth.failurePath";
    public static final String DEFAULT_RETURN_TO = "/";
    public static final String LOGIN_FAILURE_PATH = "/auth/login";
    public static final String REGISTER_FAILURE_PATH = "/auth/register";
    public static final String ACCOUNT_SETTINGS_PATH = "/settings/account";
    public static final int TIMEOUT_SECONDS = 300;

    private OAuthSession() {
        throw new UnsupportedOperationException("This class should never be instantiated");
    }
}
