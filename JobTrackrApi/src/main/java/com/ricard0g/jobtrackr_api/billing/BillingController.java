package com.ricard0g.jobtrackr_api.billing;

import java.security.Principal;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/v1/billing")
@RequiredArgsConstructor
public class BillingController {
    private final CheckoutService checkoutService;
    private final BillingTransactions transactions;
    private final StripeWebhookVerifier verifier;
    private final BillingWebhookService webhookService;
    private final BillingStatusService statusService;

    @GetMapping("/subscription")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BillingTransactions.SubscriptionStatus> subscription(final Principal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(transactions.subscriptionStatus(UUID.fromString(principal.getName())));
    }

    @PostMapping("/resubscribe")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("isAuthenticated()")
    public CheckoutService.CheckoutResponse resubscribe(final Principal principal,
                                                       @RequestHeader("Idempotency-Key") final UUID requestId) {
        return checkoutService.resubscribe(requestId, UUID.fromString(principal.getName()));
    }

    @PostMapping("/webhook")
    public void webhook(@RequestBody final String body,
                        @RequestHeader(value = "Stripe-Signature", defaultValue = "") final String signature) {
        webhookService.process(verifier.verify(body, signature));
    }

    @GetMapping("/checkouts/status")
    public ResponseEntity<BillingRepository.ClaimStatus> status(
            @RequestHeader("X-Checkout-Token") final String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(statusService.status(token));
    }

    @PostMapping("/checkouts")
    @ResponseStatus(HttpStatus.CREATED)
    public CheckoutService.CheckoutResponse checkout(@RequestHeader("Idempotency-Key") final UUID requestId) {
        return checkoutService.start(requestId);
    }
}
