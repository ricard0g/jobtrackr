package com.ricard0g.jobtrackr_api.config.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

import lombok.RequiredArgsConstructor;

@Configuration
@RequiredArgsConstructor
public class CsrfConfig {

    private final JwtProperties jwtProperties;

    @Bean
    public CookieCsrfTokenRepository csrfTokenRepository() {
        final CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookiePath("/");
        repository.setHeaderName("X-XSRF-TOKEN");
        repository.setCookieName("XSRF-TOKEN");
        repository.setCookieCustomizer(
                cookie -> cookie.sameSite(jwtProperties.getRefreshCookieSameSite()));
        return repository;
    }
}
