package com.ricard0g.jobtrackr_api.config.security;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class GoogleAuthPropertiesTest {

    @Test
    void disabledConfiguration_doesNotRequireCredentials() {
        final GoogleAuthProperties properties = new GoogleAuthProperties();

        properties.validateWhenEnabled();
    }

    @Test
    void enabledConfiguration_failsWhenCredentialsAreMissing() {
        final GoogleAuthProperties properties = new GoogleAuthProperties();
        properties.setEnabled(true);

        assertThatThrownBy(properties::validateWhenEnabled)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GOOGLE_AUTH_ENABLED");
    }

    @Test
    void enabledConfiguration_failsWhenPublicOriginIsNotAbsolute() {
        final GoogleAuthProperties properties = validEnabledProperties();
        properties.setPublicOrigin("/relative");

        assertThatThrownBy(properties::validateWhenEnabled)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JOBTRACKR_PUBLIC_ORIGIN");
    }

    @Test
    void enabledConfiguration_failsWhenClientSecretIsBlank() {
        final GoogleAuthProperties properties = validEnabledProperties();
        properties.setClientSecret(" ");

        assertThatThrownBy(properties::validateWhenEnabled)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GOOGLE_AUTH_ENABLED");
    }

    @Test
    void enabledConfiguration_failsWhenPublicOriginHasAPath() {
        final GoogleAuthProperties properties = validEnabledProperties();
        properties.setPublicOrigin("http://localhost:5173/app");

        assertThatThrownBy(properties::validateWhenEnabled)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JOBTRACKR_PUBLIC_ORIGIN");
    }

    @Test
    void enabledConfiguration_failsWhenRedirectUriIsNotTheCallback() {
        final GoogleAuthProperties properties = validEnabledProperties();
        properties.setRedirectUri("http://localhost:8080/login/oauth2/code/google");

        assertThatThrownBy(properties::validateWhenEnabled)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GOOGLE_OAUTH_REDIRECT_URI");
    }

    @Test
    void enabledConfiguration_acceptsDocumentedLocalhostSplitOrigin() {
        validEnabledProperties().validateWhenEnabled();
    }

    private static GoogleAuthProperties validEnabledProperties() {
        final GoogleAuthProperties properties = new GoogleAuthProperties();
        properties.setEnabled(true);
        properties.setClientId("client-id");
        properties.setClientSecret("client-secret");
        properties.setPublicOrigin("http://localhost:5173");
        properties.setRedirectUri("http://localhost:8080/api/v1/auth/oauth2/callback/google");
        return properties;
    }
}
