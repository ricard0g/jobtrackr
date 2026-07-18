package com.ricard0g.jobtrackr_api.worker;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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
        final List<Long> claimed = new ArrayList<>(concurrency);
        for (int i = 0; i < concurrency; i++) {
            final Long generationId = transactionTemplate.execute(status -> {
                final Long next = workerService.claimNext();
                if (next != null) {
                    workerService.markProcessing(next);
                }
                return next;
            });
            if (generationId == null) {
                break;
            }
            claimed.add(generationId);
        }
        if (claimed.isEmpty()) {
            return;
        }
        if (claimed.size() == 1) {
            processOne(claimed.get(0));
            return;
        }
        final ExecutorService executor = Executors.newFixedThreadPool(claimed.size());
        try {
            final List<? extends Future<?>> futures = claimed.stream()
                    .map(id -> executor.submit(() -> processOne(id)))
                    .toList();
            for (final Future<?> future : futures) {
                try {
                    future.get(properties.requestTimeout().toMillis() + 60_000L, TimeUnit.MILLISECONDS);
                } catch (final Exception exception) {
                    log.error("[CvGenerationScheduler] - PROCESS: batchWaitFailure: true");
                }
            }
        } finally {
            executor.shutdownNow();
        }
    }

    private void processOne(final Long generationId) {
        try {
            workerService.processClaimed(generationId);
        } catch (final RuntimeException exception) {
            log.error(
                    "[CvGenerationScheduler] - PROCESS: unexpectedFailure: true, cvGenerationId: {}",
                    generationId);
            workerService.retryOrFail(generationId, "INTERNAL_ERROR", "Unexpected worker failure", true);
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
