package com.ricard0g.jobtrackr_api.registration;

import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class RegistrationRecoveryDispatcher {
    private static final int WORKERS = 2;
    private static final int QUEUE_CAPACITY = 200;
    private static final int SHUTDOWN_TIMEOUT_SECONDS = 30;
    private final ThreadPoolTaskExecutor executor;
    private final RegistrationService service;

    public RegistrationRecoveryDispatcher(final RegistrationService service) {
        this.service = service;
        executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(WORKERS);
        executor.setMaxPoolSize(WORKERS);
        executor.setQueueCapacity(QUEUE_CAPACITY);
        executor.setThreadNamePrefix("registration-recovery-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(SHUTDOWN_TIMEOUT_SECONDS);
        executor.initialize();
    }

    public void send(final String email) {
        executor.execute(() -> {
            try {
                service.sendRecovery(email);
            } catch (final RuntimeException exception) {
                log.warn("[Registration] - RECOVERY_DELIVERY_FAILED");
            }
        });
    }

    @PreDestroy
    public void close() {
        executor.shutdown();
    }
}
