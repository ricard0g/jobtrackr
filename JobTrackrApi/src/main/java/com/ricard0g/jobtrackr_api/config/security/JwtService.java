package com.ricard0g.jobtrackr_api.config.security;

import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long accessExpirationMs;

    public JwtService(final JwtProperties jwtProperties) {
        this.signingKey = Keys.hmacShaKeyFor(jwtProperties.getSigningKey().getBytes());
        this.accessExpirationMs = jwtProperties.getAccessExpirationMs();
    }

    public String generateAccessToken(final UUID userId) {
        return Jwts.builder()
                .subject(userId.toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + accessExpirationMs))
                .signWith(signingKey)
                .compact();
    }

    public UUID extractUserId(final String token) {
        return UUID.fromString(parseClaims(token).getSubject());
    }

    public boolean isValid(final String token, final UserDetails userDetails) {
        final UUID userId = extractUserId(token);
        final Claims claims = parseClaims(token);
        return userId.toString().equals(userDetails.getUsername())
                && !claims.getExpiration().before(new Date());
    }

    public long getAccessExpirationSeconds() {
        return accessExpirationMs / 1000L;
    }

    private Claims parseClaims(final String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
