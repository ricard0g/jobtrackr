package com.ricard0g.jobtrackr_api.controller;

import java.security.Principal;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ricard0g.jobtrackr_api.billing.EntitlementService;
import com.ricard0g.jobtrackr_api.billing.EntitlementService.Entitlement;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class EntitlementController {
    private final EntitlementService entitlementService;

    @GetMapping("/api/v1/user/entitlement")
    public ResponseEntity<Entitlement> current(final Principal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(entitlementService.current(AuthenticatedUserId.from(principal)));
    }
}
