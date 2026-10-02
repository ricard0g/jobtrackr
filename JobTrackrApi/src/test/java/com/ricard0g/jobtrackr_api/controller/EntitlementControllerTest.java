package com.ricard0g.jobtrackr_api.controller;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.billing.EntitlementService;
import com.ricard0g.jobtrackr_api.billing.EntitlementService.Access;
import com.ricard0g.jobtrackr_api.billing.EntitlementService.Entitlement;
import com.ricard0g.jobtrackr_api.config.security.MethodSecurityConfig;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;

@WebMvcTest(controllers = EntitlementController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import({GlobalExceptionHandler.class, MethodSecurityConfig.class})
@WithMockUser(username = EntitlementControllerTest.USER_ID_VALUE)
class EntitlementControllerTest {

    static final String USER_ID_VALUE = "11111111-1111-4111-8111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final String PATH = "/api/v1/user/entitlement";
    private static final Instant PAID_UNTIL = Instant.parse("2026-11-01T00:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private EntitlementService entitlementService;

    @Test
    @WithAnonymousUser
    void current_withoutAuthentication_isDeniedByMethodSecurity() throws Exception {
        // when / then
        mockMvc.perform(get(PATH).principal(() -> USER_ID_VALUE))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        verifyNoInteractions(entitlementService);
    }

    @Test
    void current_withLimitedAccess_returnsEntitlementWithoutCaching() throws Exception {
        // given
        when(entitlementService.current(USER_ID)).thenReturn(new Entitlement(Access.LIMITED, false, null));

        // when / then
        mockMvc.perform(get(PATH).principal(() -> USER_ID_VALUE))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.access").value("LIMITED"))
                .andExpect(jsonPath("$.canCreateApplications").value(false))
                .andExpect(jsonPath("$.paidUntil").value(nullValue()));
        verify(entitlementService).current(USER_ID);
    }

    @Test
    void current_withPaidAccess_returnsEntitlementWithoutCaching() throws Exception {
        // given
        when(entitlementService.current(USER_ID)).thenReturn(new Entitlement(Access.PAID, true, PAID_UNTIL));

        // when / then
        mockMvc.perform(get(PATH).principal(() -> USER_ID_VALUE))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.access").value("PAID"))
                .andExpect(jsonPath("$.canCreateApplications").value(true))
                .andExpect(jsonPath("$.paidUntil").value(PAID_UNTIL.toString()));
        verify(entitlementService).current(USER_ID);
    }
}
