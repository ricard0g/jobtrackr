package com.ricard0g.jobtrackr_api.config.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

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

    @Test
    void isValid_shouldReturnFalseForExpiredToken() {
        final UUID userId = UUID.fromString("55555555-5555-5555-5555-555555555555");
        final String token = createToken(userId.toString(), -1_000L);
        final UserDetails userDetails = User.withUsername(userId.toString())
                .password("password")
                .roles("USER")
                .build();

        assertThat(jwtService.isValid(token, userDetails)).isFalse();
    }

    @Test
    void isValid_shouldReturnFalseForMalformedToken() {
        final UUID userId = UUID.fromString("66666666-6666-6666-6666-666666666666");
        final UserDetails userDetails = User.withUsername(userId.toString())
                .password("password")
                .roles("USER")
                .build();

        assertThat(jwtService.isValid("not-a-jwt", userDetails)).isFalse();
    }

    @Test
    void isValid_shouldReturnFalseForDisabledUser() {
        final UUID userId = UUID.fromString("77777777-7777-7777-7777-777777777777");
        final String token = jwtService.generateAccessToken(userId);
        final UserDetails userDetails = User.withUsername(userId.toString())
                .password("password")
                .disabled(true)
                .roles("USER")
                .build();

        assertThat(jwtService.isValid(token, userDetails)).isFalse();
    }

    @Test
    void isValid_shouldReturnFalseForLockedUser() {
        final UUID userId = UUID.fromString("88888888-8888-8888-8888-888888888888");
        final String token = jwtService.generateAccessToken(userId);
        final UserDetails userDetails = User.withUsername(userId.toString())
                .password("password")
                .accountLocked(true)
                .roles("USER")
                .build();

        assertThat(jwtService.isValid(token, userDetails)).isFalse();
    }

    @Test
    void extractUserId_withInvalidUuidSubject_shouldThrowException() {
        final String token = createToken("not-a-uuid", 900_000L);

        assertThatThrownBy(() -> jwtService.extractUserId(token))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static String createToken(final String subject, final long expirationOffsetMs) {
        final SecretKey signingKey = Keys.hmacShaKeyFor(SIGNING_KEY.getBytes());
        final Date now = new Date();
        return Jwts.builder()
                .subject(subject)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationOffsetMs))
                .signWith(signingKey)
                .compact();
    }
}
