package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.config.security.JwtProperties;
import com.ricard0g.jobtrackr_api.config.security.RefreshTokenCookieService;
import com.ricard0g.jobtrackr_api.dto.AuthDto.AuthResponse;
import com.ricard0g.jobtrackr_api.dto.UserDto.UserResponseDto;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.exception.InvalidRefreshTokenException;
import com.ricard0g.jobtrackr_api.service.AuthService;
import com.ricard0g.jobtrackr_api.service.AuthService.AuthTokenPair;

@WebMvcTest(controllers = AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import({GlobalExceptionHandler.class, RefreshTokenCookieService.class, JwtProperties.class})
class AuthControllerTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AuthService authService;

    @Test
    void register_shouldReturnAuthResponseAndSetRefreshCookie() throws Exception {
        final AuthResponse authResponse = AuthResponse.of(
                "access-token",
                900L,
                new UserResponseDto(
                        USER_ID,
                        "user@example.com",
                        "Test User",
                        null,
                        true,
                        false,
                        null,
                        null,
                        null,
                        OffsetDateTime.now(),
                        OffsetDateTime.now()));
        when(authService.register(any())).thenReturn(new AuthTokenPair(
                authResponse,
                "refresh-token-value",
                OffsetDateTime.now().plusDays(7)));

        mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "user@example.com",
                                  "password": "password123",
                                  "displayName": "Test User"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").value("access-token"))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(cookie().exists("refresh_token"));
    }

    @Test
    void login_shouldReturnAuthResponseAndSetRefreshCookie() throws Exception {
        final AuthResponse authResponse = AuthResponse.of(
                "access-token",
                900L,
                new UserResponseDto(
                        USER_ID,
                        "user@example.com",
                        "Test User",
                        null,
                        true,
                        false,
                        null,
                        null,
                        null,
                        OffsetDateTime.now(),
                        OffsetDateTime.now()));
        when(authService.login(any())).thenReturn(new AuthTokenPair(
                authResponse,
                "refresh-token-value",
                OffsetDateTime.now().plusDays(7)));

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email": "user@example.com",
                                  "password": "password123"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("access-token"))
                .andExpect(cookie().exists("refresh_token"));
    }

    @Test
    void refresh_shouldRotateCookieAndReturnNewAccessToken() throws Exception {
        final AuthResponse authResponse = AuthResponse.of(
                "new-access-token",
                900L,
                new UserResponseDto(
                        USER_ID,
                        "user@example.com",
                        "Test User",
                        null,
                        true,
                        false,
                        null,
                        null,
                        null,
                        OffsetDateTime.now(),
                        OffsetDateTime.now()));
        when(authService.refresh(any())).thenReturn(new AuthTokenPair(
                authResponse,
                "new-refresh-token",
                OffsetDateTime.now().plusDays(7)));

        mockMvc.perform(post("/auth/refresh").cookie(new jakarta.servlet.http.Cookie("refresh_token", "old-refresh-token")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-access-token"))
                .andExpect(cookie().exists("refresh_token"));
    }

    @Test
    void refresh_withoutRefreshCookie_shouldReturn401() throws Exception {
        when(authService.refresh(null)).thenThrow(new InvalidRefreshTokenException("Refresh token is missing"));

        mockMvc.perform(post("/auth/refresh"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
    }

    @Test
    void logout_shouldClearRefreshCookie() throws Exception {
        doNothing().when(authService).logout(any());

        mockMvc.perform(post("/auth/logout").cookie(new jakarta.servlet.http.Cookie("refresh_token", "refresh-token")))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge("refresh_token", 0));

        verify(authService).logout("refresh-token");
    }
}
