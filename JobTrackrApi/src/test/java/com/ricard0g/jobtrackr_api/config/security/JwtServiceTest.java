package com.ricard0g.jobtrackr_api.config.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

class JwtServiceTest {

    private static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        final JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSigningKey(SIGNING_KEY);
        jwtProperties.setAccessExpirationMs(900_000L);
        jwtService = new JwtService(jwtProperties);
    }

    @Test
    void generateAccessToken_shouldEmbedUserIdAsSubject() {
        final UUID userId = UUID.fromString("11111111-1111-1111-1111-111111111111");

        final String token = jwtService.generateAccessToken(userId);

        assertThat(jwtService.extractUserId(token)).isEqualTo(userId);
    }

    @Test
    void isValid_shouldReturnTrueForMatchingUserDetails() {
        final UUID userId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        final String token = jwtService.generateAccessToken(userId);
        final UserDetails userDetails = User.withUsername(userId.toString())
                .password("password")
                .roles("USER")
                .build();

        assertThat(jwtService.isValid(token, userDetails)).isTrue();
    }

    @Test
    void isValid_shouldReturnFalseForDifferentUser() {
        final UUID userId = UUID.fromString("33333333-3333-3333-3333-333333333333");
        final String token = jwtService.generateAccessToken(userId);
        final UserDetails userDetails = User.withUsername("44444444-4444-4444-4444-444444444444")
                .password("password")
                .roles("USER")
                .build();

        assertThat(jwtService.isValid(token, userDetails)).isFalse();
    }
}
