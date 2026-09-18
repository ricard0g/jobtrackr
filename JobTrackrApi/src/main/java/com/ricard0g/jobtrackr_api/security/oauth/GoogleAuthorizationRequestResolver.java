package com.ricard0g.jobtrackr_api.security.oauth;

import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

public final class GoogleAuthorizationRequestResolver implements OAuth2AuthorizationRequestResolver {

    static final String ACCOUNT_CHOOSER_PROMPT = "select_account";
    static final String ESSENTIAL_AUTH_TIME_CLAIMS = "{\"id_token\":{\"auth_time\":{\"essential\":true}}}";
    static final String MAX_AGE_ZERO = "0";
    private static final String PROMPT_PARAMETER = "prompt";
    private static final String MAX_AGE_PARAMETER = "max_age";
    private static final String CLAIMS_PARAMETER = "claims";

    private final OAuth2AuthorizationRequestResolver delegate;

    public GoogleAuthorizationRequestResolver(final OAuth2AuthorizationRequestResolver delegate) {
        this.delegate = delegate;
    }

    @Override
    public OAuth2AuthorizationRequest resolve(final HttpServletRequest request) {
        return customize(request, this.delegate.resolve(request));
    }

    @Override
    public OAuth2AuthorizationRequest resolve(final HttpServletRequest request, final String clientRegistrationId) {
        return customize(request, this.delegate.resolve(request, clientRegistrationId));
    }

    private static OAuth2AuthorizationRequest customize(
            final HttpServletRequest request,
            final OAuth2AuthorizationRequest resolved) {
        if (resolved == null) {
            return null;
        }
        final boolean createPassword = isCreatePasswordHandshake(request);
        return OAuth2AuthorizationRequest.from(resolved)
                .additionalParameters(params -> {
                    params.put(PROMPT_PARAMETER, ACCOUNT_CHOOSER_PROMPT);
                    if (createPassword) {
                        params.put(MAX_AGE_PARAMETER, MAX_AGE_ZERO);
                        params.put(CLAIMS_PARAMETER, ESSENTIAL_AUTH_TIME_CLAIMS);
                    }
                })
                .build();
    }

    private static boolean isCreatePasswordHandshake(final HttpServletRequest request) {
        final HttpSession session = request.getSession(false);
        if (session == null) {
            return false;
        }
        final boolean createPasswordPurpose =
                OAuthPurpose.CREATE_PASSWORD.name().equals(session.getAttribute(OAuthSession.PURPOSE_ATTRIBUTE));
        final boolean handshake = session.getAttribute(OAuthSession.ISSUED_AT_ATTRIBUTE) == null;
        return createPasswordPurpose && handshake;
    }
}
