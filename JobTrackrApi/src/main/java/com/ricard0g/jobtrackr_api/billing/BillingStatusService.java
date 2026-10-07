package com.ricard0g.jobtrackr_api.billing;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class BillingStatusService {
    private final BillingRepository repository;

    @Transactional(readOnly = true)
    public BillingRepository.ClaimStatus status(final String token) {
        return repository.claimStatus(token);
    }
}
