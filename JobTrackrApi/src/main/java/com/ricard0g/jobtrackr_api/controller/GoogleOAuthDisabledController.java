package com.ricard0g.jobtrackr_api.controller;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.config.security.GoogleAuthProperties;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthRedirects;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthResultCode;
import com.ricard0g.jobtrackr_api.security.oauth.OAuthSession;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/auth/oauth2")
@ConditionalOnProperty(prefix = "jobtrackr.google", name = "enabled", havingValue = "false", matchIfMissing = true)
@RequiredArgsConstructor
public class GoogleOAuthDisabledController {

    private final GoogleAuthProperties googleAuthProperties;

    @GetMapping({"/authorization/google", "/callback/google"})
    public ResponseEntity<Void> googleUnavailable() {
        final String location = OAuthRedirects.failureLocation(
                googleAuthProperties.normalizedPublicOrigin(),
                OAuthSession.LOGIN_FAILURE_PATH,
                OAuthResultCode.UNAVAILABLE);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, location)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("Referrer-Policy", "no-referrer")
                .build();
    }
}
