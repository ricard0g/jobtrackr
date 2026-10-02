package com.ricard0g.jobtrackr_api.billing;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
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
    public void requireApplicationCreation(final UUID userId) {
        if (!current(userId).canCreateApplications()) {
            throw new BillingException(HttpStatus.FORBIDDEN, "PAID_ACCESS_REQUIRED",
                    "Creating a new Application requires current paid access. Your existing work remains available.");
        }
    }

    public enum Access { PAID, LIMITED }

    public record Entitlement(Access access, boolean canCreateApplications, Instant paidUntil) { }
}
