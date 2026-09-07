package com.ricard0g.jobtrackr_api.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.UserIdentity;
import com.ricard0g.jobtrackr_api.repository.UserIdentityRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.service.AuthService;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "jwt.signing-key=" + SignInMethodsIntegrationTest.SIGNING_KEY,
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket"
})
class SignInMethodsIntegrationTest {

    static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private static final String PASSWORD = "password123";
    private static final String SIGN_IN_METHODS_PATH = "/api/v1/user/sign-in-methods";
    private static final String GOOGLE_SUBJECT_PREFIX = "google-subject-should-never-leak-";
    private static final OffsetDateTime PASSWORD_CHANGED_AT =
            OffsetDateTime.of(2026, 3, 4, 15, 30, 0, 0, ZoneOffset.UTC);
    private static final OffsetDateTime GOOGLE_LINKED_AT =
            OffsetDateTime.of(2026, 1, 15, 10, 0, 0, 0, ZoneOffset.UTC);
    private static final OffsetDateTime GOOGLE_LAST_USED_AT =
            OffsetDateTime.of(2026, 2, 20, 8, 45, 0, 0, ZoneOffset.UTC);
    private static final DockerImageName POSTGRES_IMAGE = DockerImageName.parse("postgres:16");

    @Container
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(POSTGRES_IMAGE);

    @DynamicPropertySource
    static void registerDatasourceProperties(final DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserIdentityRepository userIdentityRepository;

    @Autowired
    private AuthService authService;

    @MockitoBean
    private CvGenerationScheduler cvGenerationScheduler;

    @Test
    void unauthenticatedRequest_returns401() throws Exception {
        // given / when / then
        mockMvc.perform(get(SIGN_IN_METHODS_PATH))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void passwordOnlyUser_reportsPasswordEnabledAndGoogleDisconnected() throws Exception {
        // given
        final IssuedSession session = registerPasswordUser();
        setPasswordChangedAt(session.userId(), PASSWORD_CHANGED_AT);

        // when / then
        expectNoSensitiveFields(getSignInMethods(session.accessToken()))
                .andExpect(jsonPath("$.password.enabled").value(true))
                .andExpect(jsonPath("$.password.changedAt").value("2026-03-04T15:30:00Z"))
                .andExpect(jsonPath("$.google.connected").value(false))
                .andExpect(jsonPath("$.google.providerEmail").value(nullValue()))
                .andExpect(jsonPath("$.google.linkedAt").value(nullValue()))
                .andExpect(jsonPath("$.google.lastUsedAt").value(nullValue()));
    }

    @Test
    void googleOnlyUser_reportsPasswordDisabledAndGoogleConnected() throws Exception {
        // given
        final String providerEmail = uniqueEmail("google-only");
        final IssuedSession session = googleOnlySession(providerEmail, providerEmail);

        // when / then
        expectNoSensitiveFields(getSignInMethods(session.accessToken()))
                .andExpect(jsonPath("$.password.enabled").value(false))
                .andExpect(jsonPath("$.password.changedAt").value(nullValue()))
                .andExpect(jsonPath("$.google.connected").value(true))
                .andExpect(jsonPath("$.google.providerEmail").value(providerEmail))
                .andExpect(jsonPath("$.google.linkedAt").value("2026-01-15T10:00:00Z"))
                .andExpect(jsonPath("$.google.lastUsedAt").value("2026-02-20T08:45:00Z"));
    }

    @Test
    void passwordAndGoogleUser_reportsBothMethodsAndOmitsSubjectAndTokens() throws Exception {
        // given
        final IssuedSession session = registerPasswordUser();
        setPasswordChangedAt(session.userId(), PASSWORD_CHANGED_AT);
        final String providerEmail = uniqueEmail("provider");
        linkGoogleIdentity(session.userId(), providerEmail);

        // when / then
        final String googleSubject = googleSubject(session.userId());
        expectNoSensitiveFields(getSignInMethods(session.accessToken()))
                .andExpect(jsonPath("$.password.enabled").value(true))
                .andExpect(jsonPath("$.password.changedAt").value("2026-03-04T15:30:00Z"))
                .andExpect(jsonPath("$.google.connected").value(true))
                .andExpect(jsonPath("$.google.providerEmail").value(providerEmail))
                .andExpect(jsonPath("$.google.linkedAt").value("2026-01-15T10:00:00Z"))
                .andExpect(jsonPath("$.google.lastUsedAt").value("2026-02-20T08:45:00Z"))
                .andExpect(content().string(not(containsString(googleSubject))))
                .andExpect(content().string(not(containsString("id_token"))))
                .andExpect(content().string(not(containsString("access_token"))));
    }

    @Test
    void googleProviderEmailMayDifferFromPrimaryEmail() throws Exception {
        // given
        final IssuedSession session = registerPasswordUser();
        final String providerEmail = uniqueEmail("different-google");
        linkGoogleIdentity(session.userId(), providerEmail);

        // when / then
        expectNoSensitiveFields(getSignInMethods(session.accessToken()))
                .andExpect(jsonPath("$.google.connected").value(true))
                .andExpect(jsonPath("$.google.providerEmail").value(providerEmail))
                .andExpect(jsonPath("$.google.providerEmail").value(not(session.email())));
    }

    private ResultActions getSignInMethods(final String accessToken) throws Exception {
        return mockMvc.perform(get(SIGN_IN_METHODS_PATH).header("Authorization", bearer(accessToken)))
                .andExpect(status().isOk());
    }

    private static ResultActions expectNoSensitiveFields(final ResultActions actions) throws Exception {
        return actions
                .andExpect(jsonPath("$.google.subject").doesNotExist())
                .andExpect(jsonPath("$.google.providerSubject").doesNotExist())
                .andExpect(jsonPath("$.google.sub").doesNotExist())
                .andExpect(jsonPath("$.google.accessToken").doesNotExist())
                .andExpect(jsonPath("$.google.idToken").doesNotExist())
                .andExpect(jsonPath("$.google.refreshToken").doesNotExist())
                .andExpect(jsonPath("$.google.picture").doesNotExist())
                .andExpect(jsonPath("$.google.name").doesNotExist())
                .andExpect(jsonPath("$.google.displayName").doesNotExist());
    }

    private IssuedSession registerPasswordUser() throws Exception {
        final String email = uniqueEmail("password");
        final MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "%s",
                                  "password": "%s",
                                  "displayName": "Password User"
                                }
                                """.formatted(email, PASSWORD)))
                .andExpect(status().isCreated())
                .andReturn();
        return issuedSession(email, result);
    }

    private IssuedSession googleOnlySession(final String primaryEmail, final String providerEmail) {
        final User user = userRepository.saveAndFlush(User.googleJustInTime(primaryEmail));
        linkGoogleIdentity(user.getUserId(), providerEmail);
        final String accessToken = authService.issueSession(user).authResponse().accessToken();
        return new IssuedSession(user.getUserId(), primaryEmail, accessToken);
    }

    private void setPasswordChangedAt(final UUID userId, final OffsetDateTime changedAt) {
        final User user = userRepository.findById(userId).orElseThrow();
        user.setUserPasswordChangedAt(changedAt);
        userRepository.saveAndFlush(user);
    }

    private void linkGoogleIdentity(final UUID userId, final String providerEmail) {
        final User user = userRepository.findById(userId).orElseThrow();
        final UserIdentity identity =
                UserIdentity.googleIdentity(user, googleSubject(userId), providerEmail, GOOGLE_LINKED_AT);
        identity.setLastUsedAt(GOOGLE_LAST_USED_AT);
        userIdentityRepository.saveAndFlush(identity);
    }

    private IssuedSession issuedSession(final String email, final MvcResult result) throws Exception {
        final String body = result.getResponse().getContentAsString();
        final UUID userId = UUID.fromString(JsonPath.read(body, "$.user.userId"));
        final String accessToken = JsonPath.read(body, "$.accessToken");
        return new IssuedSession(userId, email, accessToken);
    }

    private static String bearer(final String accessToken) {
        return "Bearer " + accessToken;
    }

    private static String uniqueEmail(final String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@example.com";
    }

    private static String googleSubject(final UUID userId) {
        return GOOGLE_SUBJECT_PREFIX + userId;
    }

    private record IssuedSession(UUID userId, String email, String accessToken) {
    }
}
