package com.ricard0g.jobtrackr_api.registration;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationAction;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimitKey;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/auth/registration")
@RequiredArgsConstructor
public class RegistrationController {
    private final RegistrationService service;
    private final RegistrationRecoveryDispatcher recovery;
    private final GoogleRegistrationService googleRegistration;
    private final AuthenticationRateLimiter rateLimiter;

    @PostMapping("/recovery")
    public ResponseEntity<RecoveryAcknowledgement> recover(@Valid @RequestBody final RecoveryRequest body,
                                                          final HttpServletRequest request) {
        rateLimiter.consume(AuthenticationAction.REGISTRATION,
                AuthenticationRateLimitKey.emailAndClientIp(body.email(), request.getRemoteAddr()));
        recovery.send(AuthenticationRateLimitKey.canonicalizeEmail(body.email()));
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore())
                .body(new RecoveryAcknowledgement("If an unclaimed paid purchase is eligible, "
                        + "a registration link will be sent to its Checkout Email."));
    }

    public record RecoveryAcknowledgement(String message) { }

    public record RecoveryRequest(@NotBlank @Email @Size(max = 320) String email) { }

    @PostMapping("/verification")
    public ResponseEntity<Void> send(@RequestHeader("X-Checkout-Token") final String checkoutToken,
                                     final HttpServletRequest request) {
        rateLimiter.consume(AuthenticationAction.REGISTRATION,
                AuthenticationRateLimitKey.clientIp(request.getRemoteAddr()));
        service.sendVerification(checkoutToken);
        return ResponseEntity.status(HttpStatus.ACCEPTED).cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/verification")
    public ResponseEntity<RegistrationService.VerificationDetails> details(
            @RequestHeader("X-Verification-Token") final String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.verificationDetails(token));
    }

    @GetMapping("/claim")
    public ResponseEntity<RegistrationService.VerificationDetails> claim(
            @RequestHeader("X-Checkout-Token") final String checkoutToken) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.claimDetails(checkoutToken));
    }

    @PostMapping("/google")
    public ResponseEntity<Void> beginGoogle(
            @RequestHeader(name = "X-Checkout-Token", required = false) final String checkoutToken,
            @RequestHeader(name = "X-Verification-Token", required = false) final String verificationToken,
            final HttpServletRequest request, final HttpServletResponse response) {
        rateLimiter.consume(AuthenticationAction.REGISTRATION,
                AuthenticationRateLimitKey.clientIp(request.getRemoteAddr()));
        googleRegistration.begin(checkoutToken, verificationToken, request, response);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
