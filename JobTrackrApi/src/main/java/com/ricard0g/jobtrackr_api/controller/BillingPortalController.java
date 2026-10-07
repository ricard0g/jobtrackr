package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import com.ricard0g.jobtrackr_api.billing.BillingPortalService;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class BillingPortalController {
    private final BillingPortalService portalService;

    @PostMapping("/api/v1/billing/portal")
    public ResponseEntity<BillingPortalService.PortalResponse> open(final Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(portalService.open(AuthenticatedUserId.from(principal)));
    }
}
