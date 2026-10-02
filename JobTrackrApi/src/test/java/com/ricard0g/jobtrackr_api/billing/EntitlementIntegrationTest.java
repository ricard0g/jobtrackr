package com.ricard0g.jobtrackr_api.billing;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
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

    private Session register() throws Exception {
        final String email = "entitlement-" + UUID.randomUUID() + "@example.com";
        final String registration = PaidRegistrationFixture.withVerifiedPurchase(jdbc,
                "{\"email\":\"%s\",\"password\":\"%s\",\"displayName\":\"Candidate\"}".formatted(email, PASSWORD));
        final String response = http.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
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
