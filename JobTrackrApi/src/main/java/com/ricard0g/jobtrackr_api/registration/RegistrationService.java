package com.ricard0g.jobtrackr_api.registration;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RegistrationService {
    private static final Duration LINK_LIFETIME = Duration.ofMinutes(30);
    private static final int TOKEN_BYTES = 32;
    private static final int MAX_TOKEN_LENGTH = 256;
    private static final String HASH_ALGORITHM = "SHA-256";
    private static final SecureRandom RANDOM = new SecureRandom();
    private final RegistrationRepository repository;
    private final RegistrationEmailSender emailSender;

    @Transactional
    public void sendVerification(final String checkoutToken) {
        final RegistrationRepository.Claim claim = repository.lockByCheckoutToken(checkoutToken);
        sendLink(claim);
    }

    @Transactional
    public void sendRecovery(final String email) {
        repository.lockEligibleByEmail(email).ifPresent(this::sendLink);
    }

    private void sendLink(final RegistrationRepository.Claim claim) {
        final byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        final String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        final Instant linkExpiry = Instant.now().plus(LINK_LIFETIME);
        final Instant expiresAt = linkExpiry.isBefore(claim.expiresAt()) ? linkExpiry : claim.expiresAt();
        repository.storeVerification(claim, hash(token), expiresAt);
        emailSender.sendVerification(claim.email(), token, expiresAt);
    }

    @Transactional
    public VerificationDetails verificationDetails(final String token) {
        final RegistrationRepository.Claim claim = repository.lockByVerificationToken(hash(token));
        return new VerificationDetails(claim.email(), claim.expiresAt());
    }

    @Transactional
    public VerificationDetails claimDetails(final String checkoutToken) {
        final RegistrationRepository.Claim claim = repository.lockByCheckoutToken(checkoutToken);
        return new VerificationDetails(claim.email(), claim.expiresAt());
    }

    public static String hash(final String token) {
        final boolean invalidToken = token == null || token.isBlank() || token.length() > MAX_TOKEN_LENGTH;
        if (invalidToken) {
            throw RegistrationException.invalidClaim();
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance(HASH_ALGORITHM)
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (final NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Verification hashing is unavailable", exception);
        }
    }

    public record VerificationDetails(String email, Instant paidUntil) { }
}
