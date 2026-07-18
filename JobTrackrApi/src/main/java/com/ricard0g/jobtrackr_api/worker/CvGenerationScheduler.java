package com.ricard0g.jobtrackr_api.worker;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.service.CvGenerationWorkerService;
import com.ricard0g.jobtrackr_api.service.StorageCleanupService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class CvGenerationScheduler {

    private final CvGenerationWorkerService workerService;
    private final StorageCleanupService storageCleanupService;
    private final CvGenerationProperties properties;
    private final TransactionTemplate transactionTemplate;

    @Scheduled(fixedDelayString = "${jobtrackr.cv-generation.worker-poll-ms:2000}")
    public void pollGenerations() {
        final int concurrency = properties.workerConcurrency();
        for (int i = 0; i < concurrency; i++) {
            final Long generationId = transactionTemplate.execute(status -> {
                final Long claimed = workerService.claimNext();
                if (claimed != null) {
                    workerService.markProcessing(claimed);
                }
                return claimed;
            });
            if (generationId == null) {
                break;
            }
            try {
                workerService.processClaimed(generationId);
            } catch (final RuntimeException exception) {
                log.error(
                        "[CvGenerationScheduler] - PROCESS: unexpectedFailure: true, cvGenerationId: {}",
                        generationId);
                workerService.retryOrFail(generationId, "INTERNAL_ERROR", "Unexpected worker failure", true);
            }
        }
    }

    @Scheduled(fixedDelayString = "${jobtrackr.cv-generation.cleanup-poll-ms:5000}")
    public void pollStorageCleanup() {
        storageCleanupService.processNext();
    }

    @Scheduled(cron = "${jobtrackr.cv-generation.purge-cron:0 15 3 * * *}")
    public void purgeTerminalGenerations() {
        workerService.purgeExpiredTerminal();
    }
}
