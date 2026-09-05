package com.ricard0g.jobtrackr_api.controller;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.jayway.jsonpath.JsonPath;
import com.ricard0g.jobtrackr_api.worker.CvGenerationScheduler;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "jwt.signing-key=" + UserProfilePatchIntegrationTest.SIGNING_KEY,
        "spring.jpa.show-sql=false",
        "jobtrackr.r2.endpoint=https://r2.example.invalid",
        "jobtrackr.r2.access-key-id=test-access-key",
        "jobtrackr.r2.secret-access-key=test-secret-key",
        "jobtrackr.r2.bucket=test-bucket"
})
class UserProfilePatchIntegrationTest {

    static final String SIGNING_KEY = "test-signing-key-with-at-least-32-characters";

    private static final String PASSWORD = "password123";
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

    @MockitoBean
    private CvGenerationScheduler cvGenerationScheduler;

    @Test
    void patchUser_trimsDisplayNameAndPersistsIt() throws Exception {
        // given
        final IssuedSession session = registerUser("  Ada Lovelace  ");

        // when / then
        mockMvc.perform(patch("/api/v1/user")
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "  Ada Lovelace  "
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userDisplayName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.userEmail").value(session.email()));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userDisplayName").value("Ada Lovelace"));
    }

    @Test
    void patchUser_convertsBlankDisplayNameToNull() throws Exception {
        // given
        final IssuedSession session = registerUser("Named User");

        // when / then
        mockMvc.perform(patch("/api/v1/user")
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "   "
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userDisplayName").value(nullValue()));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userDisplayName").value(nullValue()));
    }

    @Test
    void patchUser_rejectsDisplayNameLongerThan160Characters() throws Exception {
        // given
        final IssuedSession session = registerUser("Named User");
        final String tooLongName = "a".repeat(161);

        // when / then
        mockMvc.perform(patch("/api/v1/user")
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "%s"
                                }
                                """.formatted(tooLongName)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("displayName"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userDisplayName").value("Named User"));
    }

    @Test
    void patchUser_rejectsEmailMutationAndLeavesPrimaryEmailUnchanged() throws Exception {
        // given
        final IssuedSession session = registerUser("Named User");

        // when / then
        mockMvc.perform(patch("/api/v1/user")
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Still Named",
                                  "userEmail": "attacker@example.com"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EMAIL_NOT_MUTABLE"));

        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userEmail").value(session.email()))
                .andExpect(jsonPath("$.userDisplayName").value("Named User"));
    }

    @Test
    void patchUser_doesNotRevokeTheCurrentSession() throws Exception {
        // given
        final IssuedSession session = registerUser("Named User");

        // when
        mockMvc.perform(patch("/api/v1/user")
                        .header("Authorization", bearer(session.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Still Named"
                                }
                                """))
                .andExpect(status().isOk());

        // then
        mockMvc.perform(get("/api/v1/user").header("Authorization", bearer(session.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userDisplayName").value("Still Named"));
    }

    private IssuedSession registerUser(final String displayName) throws Exception {
        final String email = "profile-" + UUID.randomUUID() + "@example.com";
        final MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "%s",
                                  "password": "%s",
                                  "displayName": "%s"
                                }
                                """.formatted(email, PASSWORD, displayName)))
                .andExpect(status().isCreated())
                .andReturn();
        return issuedSession(email, result);
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

    private record IssuedSession(UUID userId, String email, String accessToken) {
    }
}
