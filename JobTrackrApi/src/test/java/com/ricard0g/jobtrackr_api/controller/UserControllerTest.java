package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.dto.UserDto.UserResponseDto;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.service.UserService;

@WebMvcTest(controllers = UserController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class UserControllerTest {

    private static final String USER_ID_VALUE = "11111111-1111-1111-1111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final String BASE_PATH = "/api/v1/user";
    private static final OffsetDateTime TIMESTAMP = OffsetDateTime.parse("2026-06-04T12:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserService userService;

    @Test
    void getAuthenticatedUser_returns200() throws Exception {
        // given
        when(userService.getUserById(USER_ID)).thenReturn(sampleUser());

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_ID_VALUE))
                .andExpect(jsonPath("$.userEmail").value("user@example.com"))
                .andExpect(jsonPath("$.userDisplayName").value("Test User"));
    }

    @Test
    void getAuthenticatedUser_whenUserNotFound_returns404() throws Exception {
        // given
        when(userService.getUserById(USER_ID)).thenThrow(new UserNotFoundException(USER_ID));

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(authenticatedUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    private static UserResponseDto sampleUser() {
        return new UserResponseDto(
                USER_ID,
                "user@example.com",
                "Test User",
                null,
                true,
                false,
                null,
                null,
                null,
                TIMESTAMP,
                TIMESTAMP);
    }

    private static Principal authenticatedUser() {
        return () -> USER_ID_VALUE;
    }
}
