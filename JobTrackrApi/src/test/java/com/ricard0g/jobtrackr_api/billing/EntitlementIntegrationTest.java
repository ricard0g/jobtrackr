package com.ricard0g.jobtrackr_api.billing;

import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.support.PaidRegistrationFixture;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;
import com.ricard0g.jobtrackr_api.storage.R2ObjectStorage;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
@TestPropertySource(properties = {
        "jwt.signing-key=test-signing-key-with-at-least-32-characters",
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket"
})
class EntitlementIntegrationTest {
    private static final Instant START = Instant.parse("2030-01-01T00:00:00Z");
    private static final Instant END = Instant.parse("2030-01-08T00:00:00Z");
    private static final String ENTITLEMENT = "/api/v1/user/entitlement";
    private static final String APPLICATIONS = "/api/v1/applications";
    private static final String PASSWORD = "password123";
    private static final AtomicInteger REGISTRATION_CLIENT = new AtomicInteger();

    @Container
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16");

    @DynamicPropertySource
    static void datasource(final DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private MockMvc http;
    @Autowired
    private JdbcClient jdbc;
    @MockitoBean(name = "billingClock")
    private Clock clock;
    @MockitoBean
    private CvGenerationScheduler scheduler;
    @MockitoBean
    private R2ObjectStorage storage;

    @Test
    void paidPeriodIncludesStartAndExcludesEndForAnExistingSession() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.minusNanos(1));
        // when / then
        limited(session);
        create(session).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PAID_ACCESS_REQUIRED"));
        when(clock.instant()).thenReturn(START);
        paid(session);
        create(session).andExpect(status().isCreated());
        when(clock.instant()).thenReturn(END.minusNanos(1));
        paid(session);
        create(session).andExpect(status().isCreated());
        when(clock.instant()).thenReturn(END);
        limited(session);
        create(session).andExpect(status().isForbidden());
        http.perform(get(APPLICATIONS).header("Authorization", session.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        http.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(session.email(), PASSWORD)))
                .andExpect(status().isOk());
    }

    @Test
    void failedPaymentSuspendsCreationButPreservesSignInReadsAndEditsUntilRetryRestoresAccess() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        final String created = create(session).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        final int applicationId = JsonPath.read(created, "$.applicationId");
        // when
        subscriptionStatus(session, "past_due");
        // then
        limited(session);
        create(session).andExpect(status().isForbidden());
        http.perform(get(APPLICATIONS + "/" + applicationId).header("Authorization", session.bearer()))
                .andExpect(status().isOk());
        http.perform(patch(APPLICATIONS + "/" + applicationId).header("Authorization", session.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("{\"applicationTitle\":\"Updated role\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applicationTitle").value("Updated role"));
        http.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(session.email(), PASSWORD)))
                .andExpect(status().isOk());
        subscriptionStatus(session, "active");
        paid(session);
        create(session).andExpect(status().isCreated());
    }

    @Test
    void activeSubscriptionRequiresConfirmedPaymentForItsCurrentPeriod() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        // when
        jdbc.sql("UPDATE billing_payments SET outcome = 'unpaid' WHERE checkout_id IN "
                + "(SELECT id FROM billing_checkouts WHERE checkout_email = CAST(:email AS citext))")
                .param("email", session.email()).update();
        // then
        limited(session);
        create(session).andExpect(status().isForbidden());
        jdbc.sql("UPDATE billing_payments SET outcome = 'paid', period_end = :end WHERE checkout_id IN "
                + "(SELECT id FROM billing_checkouts WHERE checkout_email = CAST(:email AS citext))")
                .param("end", Timestamp.from(END.minusSeconds(1))).param("email", session.email()).update();
        limited(session);
    }

    @Test
    void canceledSubscriptionsAndUnlinkedUsersHaveLimitedAccessWithoutLosingTheirSession() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        // when / then
        subscriptionStatus(session, "canceled");
        limited(session);
        create(session).andExpect(status().isForbidden());
        jdbc.sql("UPDATE billing_customers SET user_id = NULL WHERE checkout_email = CAST(:email AS citext)")
                .param("email", session.email()).update();
        subscriptionStatus(session, "active");
        limited(session);
        http.perform(get("/api/v1/user").header("Authorization", session.bearer())).andExpect(status().isOk());
        http.perform(get(ENTITLEMENT)).andExpect(status().isUnauthorized());
    }

    @Test
    void limitedSessionCannotUploadBaseCvsAfterPaymentFailure() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        subscriptionStatus(session, "past_due");
        // when / then
        http.perform(multipart("/api/v1/base-cvs")
                .file(new MockMultipartFile("file", "cv.md", "text/markdown", "# Candidate\nJava developer".getBytes(StandardCharsets.UTF_8)))
                .header("Authorization", session.bearer()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PAID_ACCESS_REQUIRED"));
    }

    @Test
    void liveSessionCannotStartGenerationAtPaidPeriodEnd() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(END);
        // when / then
        generate(session, 1, 1).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PAID_ACCESS_REQUIRED"));
        http.perform(get("/api/v1/cv-generations").header("Authorization", session.bearer()))
                .andExpect(status().isOk());
        http.perform(get("/api/v1/base-cvs").header("Authorization", session.bearer()))
                .andExpect(status().isOk());
    }

    @Test
    void paidUserCanQueueAcrossApplicationsButOnlyOneGenerationPerApplication() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        final long baseCvId = upload(session);
        final int first = applicationId(session);
        final int second = applicationId(session);
        // when / then
        generate(session, first, baseCvId).andExpect(status().isAccepted());
        generate(session, first, baseCvId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GENERATION_IN_PROGRESS"));
        generate(session, second, baseCvId).andExpect(status().isAccepted());
    }

    @Test
    void savedCapacityStaysAtTwentyAndDeletionFreesSpaceWithoutWeeklyCredits() throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        final long baseCvId = upload(session);
        final int applicationId = applicationId(session);
        jdbc.sql("""
                INSERT INTO application_cvs (application_cv_application_id, application_cv_version,
                    application_cv_object_key, application_cv_original_filename, application_cv_format,
                    application_cv_content_type, application_cv_byte_size, application_cv_sha256)
                SELECT :application, version, :prefix || version, 'cv.md', 'MARKDOWN', 'text/markdown', 10,
                    repeat('a', 64) FROM generate_series(1, 20) AS version
                """).param("application", applicationId).param("prefix", UUID.randomUUID().toString()).update();
        // when / then
        generate(session, applicationId, baseCvId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GENERATION_LIMIT_REACHED"));
        subscriptionStatus(session, "past_due");
        final String saved = http.perform(get(APPLICATIONS + "/" + applicationId + "/generated-cvs")
                .header("Authorization", session.bearer())).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(20)).andReturn().getResponse().getContentAsString();
        final int generatedCvId = JsonPath.read(saved, "$[0].generatedCvId");
        http.perform(delete("/api/v1/generated-cvs/" + generatedCvId).header("Authorization", session.bearer()))
                .andExpect(status().isNoContent());
        generate(session, applicationId, baseCvId).andExpect(status().isForbidden());
        subscriptionStatus(session, "active");
        for (int attempt = 0; attempt < 21; attempt++) {
            final String created = generate(session, applicationId, baseCvId).andExpect(status().isAccepted())
                    .andReturn().getResponse().getContentAsString();
            final int generationId = JsonPath.read(created, "$.cvGenerationId");
            http.perform(post("/api/v1/cv-generations/" + generationId + "/cancel")
                    .header("Authorization", session.bearer())).andExpect(status().isOk());
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void simultaneousRequestsCannotQueueTwoGenerationsForOneApplication(final boolean sameKey) throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        final long baseCvId = upload(session);
        final int applicationId = applicationId(session);
        final String sharedKey = UUID.randomUUID().toString();
        final CountDownLatch ready = new CountDownLatch(2);
        final CountDownLatch start = new CountDownLatch(1);
        try (final ExecutorService requests = Executors.newVirtualThreadPerTaskExecutor()) {
            final Callable<Integer> request = () -> {
                ready.countDown();
                start.await(10, TimeUnit.SECONDS);
                return generate(session, applicationId, baseCvId, sameKey ? sharedKey : UUID.randomUUID().toString())
                        .andReturn().getResponse().getStatus();
            };
            final Future<Integer> first = requests.submit(request);
            final Future<Integer> second = requests.submit(request);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            // when
            start.countDown();
            // then
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(202, sameKey ? 202 : 409);
            http.perform(get("/api/v1/cv-generations").param("applicationId", String.valueOf(applicationId))
                    .header("Authorization", session.bearer())).andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "past_due"})
    void limitedSessionCanContinueExistingPursuitsAndPreviewSavedCvs(final String reason) throws Exception {
        // given
        final Session session = register();
        when(clock.instant()).thenReturn(START.plusSeconds(1));
        final int applicationId = applicationId(session);
        final String objectKey = UUID.randomUUID().toString();
        final String savedCv = "# Saved Generated CV\n\nJava developer";
        final long generatedCvId = jdbc.sql("""
                INSERT INTO application_cvs (application_cv_application_id, application_cv_version,
                    application_cv_object_key, application_cv_original_filename, application_cv_format,
                    application_cv_content_type, application_cv_byte_size, application_cv_sha256)
                VALUES (:application, 1, :key, 'saved-cv.md', 'MARKDOWN', 'text/markdown', :size, repeat('a', 64))
                RETURNING application_cv_id
                """).param("application", applicationId).param("key", objectKey)
                .param("size", savedCv.getBytes(StandardCharsets.UTF_8).length).query(Long.class).single();
        when(storage.download(objectKey)).thenReturn(savedCv.getBytes(StandardCharsets.UTF_8));
        // when
        if ("expired".equals(reason)) {
            when(clock.instant()).thenReturn(END);
        } else {
            subscriptionStatus(session, reason);
        }
        // then
        limited(session);
        create(session).andExpect(status().isForbidden());
        http.perform(patch(APPLICATIONS + "/" + applicationId).header("Authorization", session.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("{\"applicationTitle\":\"Staff Engineer\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applicationTitle").value("Staff Engineer"));
        http.perform(patch(APPLICATIONS + "/" + applicationId + "/status")
                .header("Authorization", session.bearer()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"applicationStatus\":\"INTERVIEW\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applicationStatus").value("INTERVIEW"));
        http.perform(patch(APPLICATIONS + "/" + applicationId).header("Authorization", session.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("{\"applicationKanbanOrder\":3}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applicationKanbanOrder").value(3));
        http.perform(post(APPLICATIONS + "/" + applicationId + "/interviews")
                .header("Authorization", session.bearer()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"interviewType":"TECHNICAL","interviewScheduledAt":"2030-01-09T10:00:00Z",
                         "interviewNotes":"Discuss the existing pursuit"}
                        """))
                .andExpect(status().isCreated());
        http.perform(get(APPLICATIONS + "/" + applicationId + "/interviews")
                .header("Authorization", session.bearer())).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].interviewNotes").value("Discuss the existing pursuit"));
        final String tag = http.perform(post("/api/v1/tags").header("Authorization", session.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"tagName":"Follow up","tagCategory":"OTHER","tagColor":"#123456"}
                        """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        final int tagId = JsonPath.read(tag, "$.tagId");
        http.perform(get(APPLICATIONS + "/" + applicationId).header("Authorization", session.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tags").isEmpty());
        http.perform(patch(APPLICATIONS + "/" + applicationId).header("Authorization", session.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("{\"addTagIds\":[%d]}".formatted(tagId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tags[0].tagName").value("Follow up"));
        http.perform(get(APPLICATIONS + "/" + applicationId).header("Authorization", session.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applicationTitle").value("Staff Engineer"))
                .andExpect(jsonPath("$.applicationStatus").value("INTERVIEW"))
                .andExpect(jsonPath("$.applicationKanbanOrder").value(3))
                .andExpect(jsonPath("$.tags[0].tagId").value(tagId));
        http.perform(get(APPLICATIONS + "/" + applicationId + "/generated-cvs")
                .header("Authorization", session.bearer())).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].generatedCvId").value(generatedCvId));
        http.perform(get("/api/v1/generated-cvs").header("Authorization", session.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].originalFilename").value("saved-cv.md"));
        http.perform(get("/api/v1/generated-cvs/" + generatedCvId + "/preview")
                .header("Authorization", session.bearer())).andExpect(status().isOk())
                .andExpect(content().string(savedCv));
    }

    private int applicationId(final Session session) throws Exception {
        return JsonPath.read(create(session).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.applicationId");
    }

    private long upload(final Session session) throws Exception {
        final String response = http.perform(multipart("/api/v1/base-cvs")
                .file(new MockMultipartFile("file", "cv.md", "text/markdown",
                        "# Candidate\nJava developer".getBytes(StandardCharsets.UTF_8)))
                .header("Authorization", session.bearer()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.baseCvId")).longValue();
    }

    private ResultActions generate(final Session session, final long applicationId, final long baseCvId)
            throws Exception {
        return generate(session, applicationId, baseCvId, UUID.randomUUID().toString());
    }

    private ResultActions generate(final Session session, final long applicationId, final long baseCvId,
                                   final String idempotencyKey) throws Exception {
        return http.perform(post("/api/v1/cv-generations").header("Authorization", session.bearer())
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"applicationId":%d,"baseCvId":%d,"format":"MARKDOWN",
                         "jobDescription":"Build Java APIs","consentAccepted":true}
                        """.formatted(applicationId, baseCvId)));
    }

    private Session register() throws Exception {
        final String email = "entitlement-" + UUID.randomUUID() + "@example.com";
        final String registration = PaidRegistrationFixture.withVerifiedPurchase(jdbc,
                "{\"email\":\"%s\",\"password\":\"%s\",\"displayName\":\"Candidate\"}".formatted(email, PASSWORD));
        final String response = http.perform(post("/api/v1/auth/register").with(request -> {
                    request.setRemoteAddr("192.0.2." + REGISTRATION_CLIENT.incrementAndGet());
                    return request;
                }).contentType(MediaType.APPLICATION_JSON)
                .content(registration)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        jdbc.sql("UPDATE billing_subscriptions SET period_start = :start, period_end = :end WHERE checkout_id IN "
                + "(SELECT id FROM billing_checkouts WHERE checkout_email = CAST(:email AS citext))")
                .param("start", Timestamp.from(START)).param("end", Timestamp.from(END)).param("email", email).update();
        jdbc.sql("UPDATE billing_payments SET period_start = :start, period_end = :end WHERE checkout_id IN "
                + "(SELECT id FROM billing_checkouts WHERE checkout_email = CAST(:email AS citext))")
                .param("start", Timestamp.from(START)).param("end", Timestamp.from(END)).param("email", email).update();
        final String bearer = "Bearer " + JsonPath.read(response, "$.accessToken");
        final String company = http.perform(post("/api/v1/companies").header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content("{\"companyName\":\"Company %s\"}".formatted(email)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return new Session(email, bearer, JsonPath.read(company, "$.companyId"));
    }

    private ResultActions create(final Session session) throws Exception {
        return http.perform(post(APPLICATIONS).header("Authorization", session.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"companyId":%d,"applicationTitle":"Engineer","applicationStatus":"IN_REVIEW"}
                        """.formatted(session.companyId())));
    }

    private void paid(final Session session) throws Exception {
        http.perform(get(ENTITLEMENT).header("Authorization", session.bearer())).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.access").value("PAID"))
                .andExpect(jsonPath("$.canCreateApplications").value(true))
                .andExpect(jsonPath("$.paidUntil").value(END.toString()));
    }

    private void limited(final Session session) throws Exception {
        http.perform(get(ENTITLEMENT).header("Authorization", session.bearer())).andExpect(status().isOk())
                .andExpect(jsonPath("$.access").value("LIMITED"))
                .andExpect(jsonPath("$.canCreateApplications").value(false))
                .andExpect(jsonPath("$.paidUntil").isEmpty());
    }

    private void subscriptionStatus(final Session session, final String status) {
        jdbc.sql("UPDATE billing_subscriptions SET status = :status WHERE checkout_id IN "
                + "(SELECT id FROM billing_checkouts WHERE checkout_email = CAST(:email AS citext))")
                .param("status", status).param("email", session.email()).update();
    }

    private record Session(String email, String bearer, int companyId) { }
}
