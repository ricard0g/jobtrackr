package com.ricard0g.jobtrackr_api.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.config.security.GoogleAuthConfig;

@WebMvcTest(controllers = {AuthProvidersController.class, GoogleOAuthDisabledController.class})
@AutoConfigureMockMvc(addFilters = false)
@Import(GoogleAuthConfig.class)
@TestPropertySource(properties = {
        "jobtrackr.google.enabled=false",
        "jobtrackr.google.public-origin=http://localhost:5173"
})
class AuthProvidersControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void providers_shouldHideGoogleWhenDisabled() throws Exception {
        mockMvc.perform(get("/api/v1/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.google").value(false));
    }

    @Test
    void googleStart_whenDisabled_redirectsToUnavailableResult() throws Exception {
        mockMvc.perform(get("/api/v1/auth/oauth2/authorization/google"))
                .andExpect(status().isFound())
                .andExpect(header().string(
                        "Location",
                        "http://localhost:5173/auth/login?oauthResult=unavailable"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"));
    }
}
