package com.ricard0g.jobtrackr_api.config.security;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;

@Configuration
@EnableConfigurationProperties(GoogleAuthProperties.class)
@RequiredArgsConstructor
public class GoogleAuthConfig {

    private final GoogleAuthProperties googleAuthProperties;

    @PostConstruct
    void validate() {
        googleAuthProperties.validateWhenEnabled();
    }
}
