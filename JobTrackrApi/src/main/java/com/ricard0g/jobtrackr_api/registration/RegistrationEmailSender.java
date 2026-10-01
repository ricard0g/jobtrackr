package com.ricard0g.jobtrackr_api.registration;

import java.time.Instant;

public interface RegistrationEmailSender {
    void sendVerification(String checkoutEmail, String token, Instant expiresAt);
}
