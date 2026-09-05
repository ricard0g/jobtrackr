package com.ricard0g.jobtrackr_api.config.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.controller.AuthController;
import com.ricard0g.jobtrackr_api.controller.CompanyController;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyResponseDto;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.exception.InvalidRefreshTokenException;
import com.ricard0g.jobtrackr_api.exception.RestAccessDeniedHandler;
import com.ricard0g.jobtrackr_api.exception.RestAuthenticationEntryPoint;
import com.ricard0g.jobtrackr_api.security.ratelimit.AuthenticationRateLimiter;
import com.ricard0g.jobtrackr_api.service.AuthService;
import com.ricard0g.jobtrackr_api.service.CompanyService;

@WebMvcTest(controllers = {AuthController.class, CompanyController.class})
@AutoConfigureMockMvc
@Import({
    SecurityConfig.class,
    CorsConfig.class,
    CsrfConfig.class,
    JwtConfig.class,
    GlobalExceptionHandler.class,
    RefreshTokenCookieService.class,
    RestAuthenticationEntryPoint.class,
    RestAccessDeniedHandler.class,
    JwtService.class
})
@TestPropertySource(properties = "jwt.signing-key=test-signing-key-with-at-least-32-characters")
class SecurityCsrfIntegrationTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private AuthService authService;

    @MockitoBean
    private AuthenticationRateLimiter authenticationRateLimiter;

    @MockitoBean
    private CompanyService companyService;

    @MockitoBean
    private CustomUserDetailsService customUserDetailsService;

    @BeforeEach
    void setUp() {
        final UserDetails userDetails = new JobTrackrUserDetails(
                USER_ID,
                "password-hash",
                true,
                false,
                JwtService.LEGACY_AUTHENTICATION_VERSION);
        when(customUserDetailsService.loadUserByUsername(USER_ID.toString())).thenReturn(userDetails);
        when(authService.refresh(any())).thenThrow(new InvalidRefreshTokenException("Refresh token is invalid"));
        when(companyService.createCompany(any(), any())).thenReturn(new CompanyResponseDto(
                1L,
                USER_ID,
                "Acme Corp",
                null,
                null,
                null,
                null,
                false,
                OffsetDateTime.now(),
                OffsetDateTime.now()));
    }

    @Test
    void getAuthCsrf_shouldReturnToken() throws Exception {
        mockMvc.perform(get("/api/v1/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.headerName").isNotEmpty());
    }

    @Test
    void refresh_withoutCsrfToken_shouldReturnForbidden() throws Exception {
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .cookie(new jakarta.servlet.http.Cookie("refresh_token", "refresh-token-value")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void refresh_withCsrfToken_shouldPassCsrfValidation() throws Exception {
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .cookie(new jakarta.servlet.http.Cookie("refresh_token", "refresh-token-value")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
    }

    @Test
    void logout_withoutCsrfToken_shouldReturnForbidden() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout")
                        .cookie(new jakarta.servlet.http.Cookie("refresh_token", "refresh-token-value")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void authenticatedPost_withBearerToken_shouldBypassCsrfValidation() throws Exception {
        final String accessToken = jwtService.generateAccessToken(USER_ID, JwtService.LEGACY_AUTHENTICATION_VERSION);

        mockMvc.perform(post("/api/v1/companies")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "companyName": "Acme Corp"
                                }
                                """))
                .andExpect(status().isCreated());
    }
}
