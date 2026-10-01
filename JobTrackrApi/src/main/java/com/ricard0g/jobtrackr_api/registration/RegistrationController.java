package com.ricard0g.jobtrackr_api.registration;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationAction;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimitKey;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/auth/registration")
@RequiredArgsConstructor
public class RegistrationController {
    private final RegistrationService service;
    private final AuthenticationRateLimiter rateLimiter;

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
}
