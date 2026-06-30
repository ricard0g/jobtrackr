package com.ricard0g.jobtrackr_api.config.security;

import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
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
        try {
            final Claims claims = parseClaims(token);
            final String subject = claims.getSubject();
            final boolean subjectMatches = subject != null && subject.equals(userDetails.getUsername());
            final boolean tokenNotExpired = claims.getExpiration().after(new Date());
            final boolean userCanAuthenticate = userDetails.isEnabled() && userDetails.isAccountNonLocked();
            return subjectMatches && tokenNotExpired && userCanAuthenticate;
        } catch (JwtException | IllegalArgumentException exception) {
            return false;
        }
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
