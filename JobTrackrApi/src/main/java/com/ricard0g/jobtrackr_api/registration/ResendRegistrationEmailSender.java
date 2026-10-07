package com.ricard0g.jobtrackr_api.registration;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class ResendRegistrationEmailSender implements RegistrationEmailSender {
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(REQUEST_TIMEOUT).build();
    private final RegistrationProperties properties;
    private final ObjectMapper mapper;

    @Override
    public void sendVerification(final String checkoutEmail, final String token, final Instant expiresAt) {
        final boolean missingEmailConfiguration = properties.resendApiKey().isBlank()
                || properties.publicOrigin().isBlank();
        if (missingEmailConfiguration) {
            throw RegistrationException.emailUnavailable();
        }
        final URI origin = URI.create(properties.publicOrigin());
        final boolean validOrigin = origin.getHost() != null && origin.getRawQuery() == null
                && origin.getRawFragment() == null && origin.getRawUserInfo() == null
                && ("https".equals(origin.getScheme()) || "http".equals(origin.getScheme()));
        if (!validOrigin) {
            throw RegistrationException.emailUnavailable();
        }
        final String link = properties.publicOrigin().replaceAll("/$", "") + "/auth/register#verify=" + token;
        final String text = "Verify your Checkout Email and create your JobTrackr password:\n\n" + link
                + "\n\nThis one-time link expires at " + expiresAt + ". "
                + "Your paid week began at Stripe billing; registration does not restart it. "
                + "If you did not make this purchase, ignore this email.";
        final HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
                .timeout(REQUEST_TIMEOUT).header("Authorization", "Bearer " + properties.resendApiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(Map.of(
                        "from", properties.fromEmail(), "to", List.of(checkoutEmail),
                        "subject", "Verify your Checkout Email for JobTrackr", "text", text))))
                .build();
        try {
            final HttpResponse<Void> response = CLIENT.send(request, HttpResponse.BodyHandlers.discarding());
            if (!HttpStatusCode.valueOf(response.statusCode()).is2xxSuccessful()) {
                throw RegistrationException.emailUnavailable();
            }
        } catch (final InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw RegistrationException.emailUnavailable();
        } catch (final IOException exception) {
            throw RegistrationException.emailUnavailable();
        }
    }

}
