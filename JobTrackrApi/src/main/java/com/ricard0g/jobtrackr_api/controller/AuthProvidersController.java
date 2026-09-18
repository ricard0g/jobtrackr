package com.ricard0g.jobtrackr_api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.config.security.GoogleAuthProperties;
import com.ricard0g.jobtrackr_api.dto.AuthDto.AuthProvidersResponse;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthProvidersController {

    private final GoogleAuthProperties googleAuthProperties;

    @GetMapping("/providers")
    public ResponseEntity<AuthProvidersResponse> providers() {
        return ResponseEntity.ok(new AuthProvidersResponse(googleAuthProperties.isEnabled()));
    }
}
