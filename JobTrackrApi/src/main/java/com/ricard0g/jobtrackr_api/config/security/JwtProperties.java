package com.ricard0g.jobtrackr_api.config.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@ConfigurationProperties(prefix = "jwt")
public class JwtProperties {

    private String signingKey;
    private long accessExpirationMs = 900_000L;
    private long refreshExpirationMs = 604_800_000L;
    private String refreshCookieName = "refresh_token";
    private boolean refreshCookieSecure = false;
    private String refreshCookieSameSite = "Lax";
}
