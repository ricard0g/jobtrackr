package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import com.ricard0g.jobtrackr_api.client.CvGenerationServiceClient;
import com.ricard0g.jobtrackr_api.client.CvGenerationServiceClient.GenerationResult;
import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.ApplicationCv;
import com.ricard0g.jobtrackr_api.model.BaseCv;
import com.ricard0g.jobtrackr_api.model.CvGeneration;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.CvGenerationStatus;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.repository.ApplicationCvRepository;
import com.ricard0g.jobtrackr_api.repository.CvGenerationRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.storage.ObjectStorage;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CvGenerationWorkerServiceTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");

    @Mock
    private CvGenerationRepository cvGenerationRepository;

    @Mock
    private ApplicationCvRepository applicationCvRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ObjectStorage objectStorage;

    @Mock
    private CvGenerationServiceClient client;

    @Mock
    private ApplicationCvService applicationCvService;

    @Mock
    private CvGenerationProperties properties;

    @Mock
    private EntityManager entityManager;

    @Mock
    private TransactionTemplate transactionTemplate;

    @Mock
    private Query lockQuery;

    private CvGenerationWorkerService service;

    @BeforeEach
    void setUp() {
        when(properties.leaseDuration()).thenReturn(Duration.ofMinutes(15));
        when(properties.maxApplicationCvs()).thenReturn(20);
        service = new CvGenerationWorkerService(
                cvGenerationRepository,
                applicationCvRepository,
                userRepository,
                objectStorage,
                client,
                applicationCvService,
                properties,
                entityManager,
                transactionTemplate);
        when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            final TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(org.mockito.Mockito.mock(TransactionStatus.class));
        });
        org.mockito.Mockito.doAnswer(invocation -> {
                    final Consumer<TransactionStatus> action = invocation.getArgument(0);
                    action.accept(org.mockito.Mockito.mock(TransactionStatus.class));
                    return null;
                })
                .when(transactionTemplate)
                .executeWithoutResult(any());
    }

    @Test
    void processClaimed_uploadsThenPersistsCompletedGeneration() {
        // given
        final CvGeneration generation = newGeneration();
        when(cvGenerationRepository.findById(11L)).thenReturn(Optional.of(generation));
        when(objectStorage.download("base-key")).thenReturn(new byte[] {1, 2, 3});
        when(client.generate(any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(GenerationResult.success(
                        new byte[] {9, 9, 9},
                        "application/pdf",
                        "fake-cv-v1",
                        "cv-graph-v1",
                        "abc"));
        when(userRepository.findByIdForUpdate(USER_ID)).thenReturn(Optional.of(generation.getUser()));
        when(entityManager.createNativeQuery(anyString())).thenReturn(lockQuery);
        when(lockQuery.setParameter(anyString(), any())).thenReturn(lockQuery);
        when(lockQuery.getSingleResult()).thenReturn(3L);
        when(applicationCvRepository.countByApplication_ApplicationId(3L)).thenReturn(0L);
        when(applicationCvRepository.findMaxVersion(3L)).thenReturn(1);
        when(applicationCvRepository.saveAndFlush(any(ApplicationCv.class))).thenAnswer(invocation -> {
            final ApplicationCv cv = invocation.getArgument(0);
            cv.setApplicationCvId(99L);
            return cv;
        });

        // when
        service.markProcessing(11L);
        service.processClaimed(11L);

        // then
        verify(objectStorage).upload(anyString(), eq(new byte[] {9, 9, 9}), eq("application/pdf"));
        verify(applicationCvRepository).saveAndFlush(any(ApplicationCv.class));
        assertThat(generation.getStatus()).isEqualTo(CvGenerationStatus.COMPLETED);
        verify(applicationCvService, never()).scheduleCleanup(anyString());
    }

    @Test
    void finalizeSuccess_schedulesCleanupWhenGenerationMissingAfterUpload() {
        // given
        final CvGeneration generation = newGeneration();
        when(userRepository.findByIdForUpdate(USER_ID)).thenReturn(Optional.of(generation.getUser()));
        when(entityManager.createNativeQuery(anyString())).thenReturn(lockQuery);
        when(lockQuery.setParameter(anyString(), any())).thenReturn(lockQuery);
        when(lockQuery.getSingleResult()).thenReturn(3L);
        when(applicationCvRepository.countByApplication_ApplicationId(3L)).thenReturn(0L);
        when(applicationCvRepository.findMaxVersion(3L)).thenReturn(0);

        service.markProcessing(11L);
        when(cvGenerationRepository.findById(11L))
                .thenReturn(Optional.of(generation))
                .thenReturn(Optional.empty());

        // when
        service.finalizeSuccess(
                11L,
                GenerationResult.success(
                        new byte[] {1}, "application/pdf", "fake-cv-v1", "cv-graph-v1", "sha"));

        // then
        final ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(objectStorage).upload(keyCaptor.capture(), any(), anyString());
        verify(applicationCvService).scheduleCleanup(keyCaptor.getValue());
        verify(applicationCvRepository, never()).saveAndFlush(any());
    }

    @Test
    void retryOrFail_doesNotMutateWhenLeaseOwnedByAnotherWorker() {
        // given
        final CvGeneration generation = newGeneration();
        generation.setStatus(CvGenerationStatus.PROCESSING);
        generation.setLeaseOwner("other-worker");
        when(cvGenerationRepository.findById(11L)).thenReturn(Optional.of(generation));

        // when
        service.retryOrFail(11L, "PROVIDER_UNAVAILABLE", "unavailable", true);

        // then
        assertThat(generation.getStatus()).isEqualTo(CvGenerationStatus.PROCESSING);
        verify(cvGenerationRepository, never()).save(generation);
    }

    private CvGeneration newGeneration() {
        final User user = User.localAccount("ada@example.com", "hash", "Ada Lovelace");
        user.setUserId(USER_ID);
        final Application application = org.mockito.Mockito.mock(Application.class);
        lenient().when(application.getApplicationId()).thenReturn(3L);
        lenient().when(application.getUser()).thenReturn(user);
        final BaseCv baseCv = org.mockito.Mockito.mock(BaseCv.class);
        lenient().when(baseCv.getObjectKey()).thenReturn("base-key");
        lenient().when(baseCv.getOriginalFilename()).thenReturn("cv.pdf");
        lenient().when(baseCv.getContentType()).thenReturn("application/pdf");
        final CvGeneration generation = CvGeneration.create(
                user,
                application,
                baseCv,
                "idem-1",
                GeneratedCvFormat.PDF,
                "Job description",
                null,
                "v1",
                3);
        generation.setCvGenerationId(11L);
        when(cvGenerationRepository.findById(11L)).thenReturn(Optional.of(generation));
        return generation;
    }
}
