package com.ricard0g.jobtrackr_api.security.oauth;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

public final class MockGoogleOidcServer implements AutoCloseable {

    private static final String CLIENT_ID = "test-google-client";
    private static final String JSON_CONTENT_TYPE = "application/json";

    private final HttpServer httpServer;
    private final RSAKey rsaKey;
    private final Map<String, PendingAuthorization> authorizations = new ConcurrentHashMap<>();
    private volatile PlannedAuthorization plannedAuthorization = PlannedAuthorization.success(
            "google-subject",
            "linked@example.com",
            true);
    private volatile PlannedToken plannedToken = PlannedToken.VALID;

    private MockGoogleOidcServer(final HttpServer httpServer, final RSAKey rsaKey) {
        this.httpServer = httpServer;
        this.rsaKey = rsaKey;
    }

    public static MockGoogleOidcServer start() {
        try {
            final RSAKey rsaKey = new RSAKeyGenerator(2048)
                    .keyID("google-test")
                    .keyUse(KeyUse.SIGNATURE)
                    .algorithm(JWSAlgorithm.RS256)
                    .generate();
            final HttpServer httpServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            final MockGoogleOidcServer server = new MockGoogleOidcServer(httpServer, rsaKey);
            httpServer.createContext("/.well-known/openid-configuration", server::handleDiscovery);
            httpServer.createContext("/jwks", server::handleJwks);
            httpServer.createContext("/authorize", server::handleAuthorize);
            httpServer.createContext("/token", server::handleToken);
            httpServer.setExecutor(Executors.newCachedThreadPool());
            httpServer.start();
            return server;
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to start mock Google OIDC server", exception);
        }
    }

    public String issuer() {
        return "http://127.0.0.1:" + httpServer.getAddress().getPort();
    }

    public String authorizationEndpoint() {
        return issuer() + "/authorize";
    }

    public String tokenEndpoint() {
        return issuer() + "/token";
    }

    public String jwkSetEndpoint() {
        return issuer() + "/jwks";
    }

    public void planSuccess(final String subject, final String email, final boolean emailVerified) {
        plannedAuthorization = PlannedAuthorization.success(subject, email, emailVerified);
        plannedToken = PlannedToken.VALID;
    }

    public void planAccessDenied() {
        plannedAuthorization = PlannedAuthorization.userDeniedConsent();
        plannedToken = PlannedToken.VALID;
    }

    public void planMissingEmail() {
        plannedAuthorization = PlannedAuthorization.success("google-subject", null, true);
        plannedToken = PlannedToken.VALID;
    }

    @Override
    public void close() {
        httpServer.stop(0);
    }

    private void handleDiscovery(final HttpExchange exchange) throws IOException {
        final String issuer = issuer();
        final String body = """
                {
                  "issuer": "%s",
                  "authorization_endpoint": "%s/authorize",
                  "token_endpoint": "%s/token",
                  "jwks_uri": "%s/jwks",
                  "response_types_supported": ["code"],
                  "subject_types_supported": ["public"],
                  "id_token_signing_alg_values_supported": ["RS256"]
                }
                """.formatted(issuer, issuer, issuer, issuer);
        write(exchange, 200, JSON_CONTENT_TYPE, body);
    }

    private void handleJwks(final HttpExchange exchange) throws IOException {
        write(exchange, 200, JSON_CONTENT_TYPE, new JWKSet(rsaKey.toPublicJWK()).toString());
    }

    private void handleAuthorize(final HttpExchange exchange) throws IOException {
        final Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
        final String redirectUri = query.get("redirect_uri");
        final String state = query.getOrDefault("state", "");
        if (plannedAuthorization.denied()) {
            redirect(exchange, redirectUri + querySeparator(redirectUri)
                    + "error=access_denied&state=" + urlEncode(state));
            return;
        }
        final String code = UUID.randomUUID().toString();
        authorizations.put(code, new PendingAuthorization(
                query.get("nonce"),
                plannedAuthorization.subject(),
                plannedAuthorization.email(),
                plannedAuthorization.emailVerified()));
        redirect(exchange, redirectUri + querySeparator(redirectUri)
                + "code=" + urlEncode(code)
                + "&state=" + urlEncode(state));
    }

    private void handleToken(final HttpExchange exchange) throws IOException {
        final Map<String, String> form = parseQuery(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        final PendingAuthorization pending = authorizations.remove(form.get("code"));
        if (pending == null || plannedToken != PlannedToken.VALID) {
            write(exchange, 400, JSON_CONTENT_TYPE, "{\"error\":\"invalid_grant\"}");
            return;
        }
        try {
            final String idToken = signedIdToken(pending);
            final String body = """
                    {
                      "access_token": "mock-google-access-token",
                      "token_type": "Bearer",
                      "expires_in": 3600,
                      "id_token": "%s"
                    }
                    """.formatted(idToken);
            write(exchange, 200, JSON_CONTENT_TYPE, body);
        } catch (Exception exception) {
            write(exchange, 500, JSON_CONTENT_TYPE, "{\"error\":\"server_error\"}");
        }
    }

    private String signedIdToken(final PendingAuthorization pending) throws Exception {
        final Instant now = Instant.now();
        final JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer())
                .subject(pending.subject())
                .audience(CLIENT_ID)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .claim("nonce", pending.nonce());
        if (pending.email() != null) {
            claims.claim("email", pending.email());
        }
        claims.claim("email_verified", pending.emailVerified());
        final SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(rsaKey.getKeyID()).build(),
                claims.build());
        jwt.sign(new RSASSASigner(rsaKey.toPrivateKey()));
        return jwt.serialize();
    }

    private static void redirect(final HttpExchange exchange, final String location) throws IOException {
        exchange.getResponseHeaders().add("Location", location);
        exchange.sendResponseHeaders(302, -1);
        exchange.close();
    }

    private static void write(
            final HttpExchange exchange,
            final int status,
            final String contentType,
            final String body) throws IOException {
        final byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", contentType);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

    private static Map<String, String> parseQuery(final String rawQuery) {
        final Map<String, String> values = new HashMap<>();
        if (rawQuery == null || rawQuery.isBlank()) {
            return values;
        }
        for (final String pair : rawQuery.split("&")) {
            final int separator = pair.indexOf('=');
            if (separator < 0) {
                values.put(urlDecode(pair), "");
                continue;
            }
            values.put(urlDecode(pair.substring(0, separator)), urlDecode(pair.substring(separator + 1)));
        }
        return values;
    }

    private static String urlDecode(final String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static String urlEncode(final String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String querySeparator(final String redirectUri) {
        return redirectUri.contains("?") ? "&" : "?";
    }

    private record PendingAuthorization(
            String nonce,
            String subject,
            String email,
            boolean emailVerified) {
    }

    private record PlannedAuthorization(
            String subject,
            String email,
            boolean emailVerified,
            boolean denied) {

        static PlannedAuthorization success(
                final String subject,
                final String email,
                final boolean emailVerified) {
            return new PlannedAuthorization(subject, email, emailVerified, false);
        }

        static PlannedAuthorization userDeniedConsent() {
            return new PlannedAuthorization(null, null, false, true);
        }
    }

    private enum PlannedToken {
        VALID
    }
}
