package com.ricard0g.jobtrackr_api.config.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfigurationSource;

import com.ricard0g.jobtrackr_api.security.oauth.GoogleOAuthFailureHandler;
import com.ricard0g.jobtrackr_api.security.oauth.GoogleOAuthStartFilter;
import com.ricard0g.jobtrackr_api.security.oauth.GoogleOAuthSuccessHandler;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;
import com.ricard0g.jobtrackr_api.service.RefreshTokenService;

import lombok.RequiredArgsConstructor;

@Configuration
@ConditionalOnProperty(prefix = "jobtrackr.google", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class GoogleOAuthSecurityConfig {

    private static final String AUTHORIZATION_BASE_URI = "/api/v1/auth/oauth2/authorization";
    private static final String REDIRECTION_BASE_URI = "/api/v1/auth/oauth2/callback/*";
    private static final String ACCOUNT_CHOOSER_PROMPT = "select_account";

    private final GoogleAuthProperties googleAuthProperties;
    private final AuthenticationRateLimiter authenticationRateLimiter;
    private final OauthSessionCookieService oauthSessionCookieService;
    private final RefreshTokenCookieService refreshTokenCookieService;
    private final RefreshTokenService refreshTokenService;
    private final GoogleOAuthSuccessHandler googleOAuthSuccessHandler;
    private final GoogleOAuthFailureHandler googleOAuthFailureHandler;
    private final CorsConfigurationSource corsConfigurationSource;

    @Bean
    ClientRegistrationRepository clientRegistrationRepository() {
        final ClientRegistration google = ClientRegistration.withRegistrationId("google")
                .clientId(googleAuthProperties.getClientId())
                .clientSecret(googleAuthProperties.getClientSecret())
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(googleAuthProperties.getRedirectUri())
                .scope("openid", "email")
                .authorizationUri(googleAuthProperties.getAuthorizationUri())
                .tokenUri(googleAuthProperties.getTokenUri())
                .jwkSetUri(googleAuthProperties.getJwkSetUri())
                .issuerUri(googleAuthProperties.getIssuerUri())
                .userNameAttributeName(IdTokenClaimNames.SUB)
                .clientName("Google")
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }

    @Bean
    @Order(1)
    SecurityFilterChain googleOAuthSecurityFilterChain(
            final HttpSecurity http,
            final ClientRegistrationRepository clientRegistrationRepository) throws Exception {
        final DefaultOAuth2AuthorizationRequestResolver resolver = new DefaultOAuth2AuthorizationRequestResolver(
                clientRegistrationRepository,
                AUTHORIZATION_BASE_URI);
        resolver.setAuthorizationRequestCustomizer(builder -> builder.additionalParameters(
                params -> params.put("prompt", ACCOUNT_CHOOSER_PROMPT)));

        final GoogleOAuthStartFilter startFilter = new GoogleOAuthStartFilter(
                authenticationRateLimiter,
                oauthSessionCookieService,
                refreshTokenCookieService,
                refreshTokenService,
                googleAuthProperties);

        return http
                .securityMatcher("/api/v1/auth/oauth2/**")
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .oauth2Login(oauth2 -> oauth2
                        .authorizationEndpoint(authorization -> authorization
                                .baseUri(AUTHORIZATION_BASE_URI)
                                .authorizationRequestResolver(resolver))
                        .redirectionEndpoint(redirection -> redirection.baseUri(REDIRECTION_BASE_URI))
                        .successHandler(googleOAuthSuccessHandler)
                        .failureHandler(googleOAuthFailureHandler))
                .addFilterBefore(startFilter, OAuth2AuthorizationRequestRedirectFilter.class)
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .build();
    }
}
