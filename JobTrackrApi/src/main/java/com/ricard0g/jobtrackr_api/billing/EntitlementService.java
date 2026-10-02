package com.ricard0g.jobtrackr_api.billing;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class EntitlementService {
    private final BillingRepository repository;
    private final ObjectProvider<Clock> clocks;

    @Transactional(readOnly = true)
    public Entitlement current(final UUID userId) {
        return repository.paidUntil(userId, clocks.getIfAvailable(Clock::systemUTC).instant())
                .map(paidUntil -> new Entitlement(Access.PAID, true, paidUntil))
                .orElseGet(() -> new Entitlement(Access.LIMITED, false, null));
    }

    @Transactional(readOnly = true)
    public boolean canCreateApplications(final Authentication authentication) {
        return current(UUID.fromString(authentication.getName())).canCreateApplications();
    }

    public enum Access { PAID, LIMITED }

    public record Entitlement(Access access, boolean canCreateApplications, Instant paidUntil) { }
}
