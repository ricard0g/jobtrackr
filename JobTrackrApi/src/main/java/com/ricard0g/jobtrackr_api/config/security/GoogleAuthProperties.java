package com.ricard0g.jobtrackr_api.config.security;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

import com.ricard0g.jobtrackr_api.exception.GoogleAuthUnavailableException;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@ConfigurationProperties(prefix = "jobtrackr.google")
public class GoogleAuthProperties {

    private static final String CALLBACK_PATH = "/api/v1/auth/oauth2/callback/google";

    private boolean enabled = false;
    private String clientId = "";
    private String clientSecret = "";
    private String publicOrigin = "";
    private String redirectUri = "";
    private String issuerUri = "https://accounts.google.com";
    private String authorizationUri = "https://accounts.google.com/o/oauth2/v2/auth";
    private String tokenUri = "https://oauth2.googleapis.com/token";
    private String jwkSetUri = "https://www.googleapis.com/oauth2/v3/certs";

    public void validateWhenEnabled() {
        if (!enabled) {
            return;
        }
        if (isBlank(clientId)
                || isBlank(clientSecret)
                || isBlank(publicOrigin)
                || isBlank(redirectUri)) {
            throw new IllegalStateException(
                    "GOOGLE_AUTH_ENABLED is true but GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, "
                            + "JOBTRACKR_PUBLIC_ORIGIN, or GOOGLE_OAUTH_REDIRECT_URI is missing");
        }
        requireAbsoluteOrigin("JOBTRACKR_PUBLIC_ORIGIN", publicOrigin);
        requireExactCallbackUri("GOOGLE_OAUTH_REDIRECT_URI", redirectUri);
    }

    public void requireEnabled() {
        if (!enabled) {
            throw new GoogleAuthUnavailableException();
        }
    }

    public String normalizedPublicOrigin() {
        if (isBlank(publicOrigin)) {
            return "";
        }
        return publicOrigin.endsWith("/")
                ? publicOrigin.substring(0, publicOrigin.length() - 1)
                : publicOrigin;
    }

    private static void requireAbsoluteOrigin(final String name, final String value) {
        final URI uri = parseAbsoluteUri(name, value);
        final String path = uri.getPath();
        final boolean hasDisallowedPath = path != null && !path.isEmpty() && !"/".equals(path);
        if (hasDisallowedPath || hasQueryOrFragment(uri)) {
            throw new IllegalStateException(name + " must be an origin without a path, query, or fragment");
        }
    }

    private static void requireExactCallbackUri(final String name, final String value) {
        final URI uri = parseAbsoluteUri(name, value);
        final boolean wrongPath = !CALLBACK_PATH.equals(uri.getPath());
        if (wrongPath || hasQueryOrFragment(uri)) {
            throw new IllegalStateException(name + " must be the exact Google callback URI");
        }
    }

    private static URI parseAbsoluteUri(final String name, final String value) {
        final URI uri = URI.create(value);
        final boolean missingOrigin = uri.getScheme() == null || uri.getHost() == null;
        if (missingOrigin) {
            throw new IllegalStateException(name + " must be an absolute URI");
        }
        return uri;
    }

    private static boolean hasQueryOrFragment(final URI uri) {
        return uri.getRawQuery() != null || uri.getRawFragment() != null;
    }

    private static boolean isBlank(final String value) {
        return value == null || value.isBlank();
    }
}
