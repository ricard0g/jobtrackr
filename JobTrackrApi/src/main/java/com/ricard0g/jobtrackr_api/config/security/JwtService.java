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

    static final String AUTHENTICATION_VERSION_CLAIM = "auth_version";
    static final int LEGACY_AUTHENTICATION_VERSION = 0;

    private final SecretKey signingKey;
    private final long accessExpirationMs;

    public JwtService(final JwtProperties jwtProperties) {
        this.signingKey = Keys.hmacShaKeyFor(jwtProperties.getSigningKey().getBytes());
        this.accessExpirationMs = jwtProperties.getAccessExpirationMs();
    }

    public String generateAccessToken(final UUID userId, final int authenticationVersion) {
        return Jwts.builder()
                .subject(userId.toString())
                .claim(AUTHENTICATION_VERSION_CLAIM, authenticationVersion)
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
            final boolean authenticationVersionMatches =
                    extractAuthenticationVersion(claims) == persistedAuthenticationVersion(userDetails);
            return subjectMatches && tokenNotExpired && userCanAuthenticate && authenticationVersionMatches;
        } catch (JwtException | IllegalArgumentException exception) {
            return false;
        }
    }

    public long getAccessExpirationSeconds() {
        return accessExpirationMs / 1000L;
    }

    private int extractAuthenticationVersion(final Claims claims) {
        final Object value = claims.get(AUTHENTICATION_VERSION_CLAIM);
        if (value == null) {
            return LEGACY_AUTHENTICATION_VERSION;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        throw new JwtException("Invalid authentication version claim");
    }

    private int persistedAuthenticationVersion(final UserDetails userDetails) {
        if (!(userDetails instanceof JobTrackrUserDetails jobTrackrUserDetails)) {
            throw new JwtException("Authenticated principal is missing an authentication version");
        }
        return jobTrackrUserDetails.getAuthenticationVersion();
    }

    private Claims parseClaims(final String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
