package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.Principal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyResponseDto;
import com.ricard0g.jobtrackr_api.exception.CompanyHasApplicationsException;
import com.ricard0g.jobtrackr_api.exception.CompanyNotFoundException;
import com.ricard0g.jobtrackr_api.exception.DuplicateCompanyNameException;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.service.CompanyService;

@WebMvcTest(controllers = CompanyController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class CompanyControllerTest {

    private static final String USER_ID_VALUE = "11111111-1111-1111-1111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final String BASE_PATH = "/api/v1/companies";
    private static final OffsetDateTime TIMESTAMP = OffsetDateTime.parse("2026-06-04T12:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CompanyService companyService;

    @Test
    void getAllCompanies_returns200() throws Exception {
        // given
        final CompanyResponseDto company = sampleCompany(1L, "Acme Corp");
        when(companyService.getAllCompanies(USER_ID)).thenReturn(List.of(company));

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].companyId").value(1))
                .andExpect(jsonPath("$[0].userId").value(USER_ID_VALUE))
                .andExpect(jsonPath("$[0].companyName").value("Acme Corp"));
    }

    @Test
    void getAllCompanies_whenUserNotFound_returns404() throws Exception {
        // given
        when(companyService.getAllCompanies(USER_ID)).thenThrow(new UserNotFoundException(USER_ID));

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(authenticatedUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void getCompanyById_returns200() throws Exception {
        // given
        final CompanyResponseDto company = sampleCompany(2L, "Globex");
        when(companyService.getCompanyById(USER_ID, 2L)).thenReturn(company);

        // when / then
        mockMvc.perform(get(BASE_PATH + "/2").principal(authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.companyId").value(2))
                .andExpect(jsonPath("$.companyName").value("Globex"));
    }

    @Test
    void getCompanyById_whenNotFound_returns404() throws Exception {
        // given
        when(companyService.getCompanyById(USER_ID, 99L)).thenThrow(new CompanyNotFoundException(USER_ID, 99L));

        // when / then
        mockMvc.perform(get(BASE_PATH + "/99").principal(authenticatedUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMPANY_NOT_FOUND"));
    }

    @Test
    void getCompanyById_withInvalidCompanyId_returns400() throws Exception {
        // when / then
        mockMvc.perform(get(BASE_PATH + "/0").principal(authenticatedUser())).andExpect(status().isBadRequest());
    }

    @Test
    void createCompany_withValidBody_returns201() throws Exception {
        // given
        final CompanyResponseDto created =
                sampleCompany(3L, "Initech", "https://initech.example");
        when(companyService.createCompany(eq(USER_ID), any(CompanyCreateRequestDto.class))).thenReturn(created);

        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": "Initech",
                                          "companyWebsiteUrl": "https://initech.example"
                                        }
                                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.companyId").value(3))
                .andExpect(jsonPath("$.companyName").value("Initech"))
                .andExpect(jsonPath("$.companyWebsiteUrl").value("https://initech.example"));

        verify(companyService).createCompany(eq(USER_ID), any(CompanyCreateRequestDto.class));
    }

    @Test
    void createCompany_withOnlyRequiredFields_returns201() throws Exception {
        // given
        final CompanyResponseDto created = sampleCompany(4L, "Umbrella");
        when(companyService.createCompany(eq(USER_ID), any(CompanyCreateRequestDto.class))).thenReturn(created);

        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": "Umbrella"
                                        }
                                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.companyName").value("Umbrella"));
    }

    @Test
    void createCompany_withBlankName_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": ""
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void createCompany_withInvalidWebsiteUrl_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": "Acme",
                                          "companyWebsiteUrl": "not-a-url"
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("companyWebsiteUrl"));
    }

    @Test
    void createCompany_whenUserNotFound_returns404() throws Exception {
        // given
        when(companyService.createCompany(eq(USER_ID), any(CompanyCreateRequestDto.class)))
                .thenThrow(new UserNotFoundException(USER_ID));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": "Acme"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void createCompany_whenDuplicateName_returns409() throws Exception {
        // given
        when(companyService.createCompany(eq(USER_ID), any(CompanyCreateRequestDto.class)))
                .thenThrow(new DuplicateCompanyNameException(USER_ID, "Acme"));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH).principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": "Acme"
                                        }
                                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_COMPANY_NAME"));
    }

    @Test
    void replaceCompany_withValidBody_returns200() throws Exception {
        // given
        final CompanyResponseDto updated = sampleCompany(2L, "Globex Updated", "https://globex.example");
        when(companyService.replaceCompany(eq(USER_ID), eq(2L), any(CompanyPutRequestDto.class))).thenReturn(updated);

        // when / then
        mockMvc.perform(
                        put(BASE_PATH + "/2").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": "Globex Updated",
                                          "companyWebsiteUrl": "https://globex.example"
                                        }
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.companyId").value(2))
                .andExpect(jsonPath("$.companyName").value("Globex Updated"));

        verify(companyService).replaceCompany(eq(USER_ID), eq(2L), any(CompanyPutRequestDto.class));
    }

    @Test
    void replaceCompany_whenNotFound_returns404() throws Exception {
        // given
        when(companyService.replaceCompany(eq(USER_ID), eq(99L), any(CompanyPutRequestDto.class)))
                .thenThrow(new CompanyNotFoundException(USER_ID, 99L));

        // when / then
        mockMvc.perform(
                        put(BASE_PATH + "/99").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": "Globex"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMPANY_NOT_FOUND"));
    }

    @Test
    void replaceCompany_whenDuplicateName_returns409() throws Exception {
        // given
        when(companyService.replaceCompany(eq(USER_ID), eq(2L), any(CompanyPutRequestDto.class)))
                .thenThrow(new DuplicateCompanyNameException(USER_ID, "Acme"));

        // when / then
        mockMvc.perform(
                        put(BASE_PATH + "/2").principal(authenticatedUser())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyName": "Acme"
                                        }
                                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_COMPANY_NAME"));
    }

    @Test
    void deleteCompany_returns204() throws Exception {
        // given
        doNothing().when(companyService).deleteCompany(USER_ID, 2L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/2").principal(authenticatedUser())).andExpect(status().isNoContent());

        verify(companyService).deleteCompany(USER_ID, 2L);
    }

    @Test
    void deleteCompany_whenNotFound_returns404() throws Exception {
        // given
        doThrow(new CompanyNotFoundException(USER_ID, 99L)).when(companyService).deleteCompany(USER_ID, 99L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/99").principal(authenticatedUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMPANY_NOT_FOUND"));
    }

    @Test
    void deleteCompany_whenHasApplications_returns409() throws Exception {
        // given
        doThrow(new CompanyHasApplicationsException(2L)).when(companyService).deleteCompany(USER_ID, 2L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/2").principal(authenticatedUser()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("COMPANY_HAS_APPLICATIONS"));
    }

    @Test
    void getAllCompanies_whenGlobalCompany_returnsGlobalFlag() throws Exception {
        // given
        final CompanyResponseDto globalCompany = new CompanyResponseDto(
                100L,
                null,
                "Google",
                "https://www.google.com",
                "Mountain View, CA",
                "Enterprise",
                "https://logos.hunter.io/google.com",
                true,
                TIMESTAMP,
                TIMESTAMP);
        when(companyService.getAllCompanies(USER_ID)).thenReturn(List.of(globalCompany));

        // when / then
        mockMvc.perform(get(BASE_PATH).principal(authenticatedUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].companyId").value(100))
                .andExpect(jsonPath("$[0].global").value(true))
                .andExpect(jsonPath("$[0].userId").doesNotExist());
    }

    private static CompanyResponseDto sampleCompany(final Long companyId, final String companyName) {
        return sampleCompany(companyId, companyName, "https://example.com");
    }

    private static CompanyResponseDto sampleCompany(
            final Long companyId, final String companyName, final String companyWebsiteUrl) {
        return new CompanyResponseDto(
                companyId,
                USER_ID,
                companyName,
                companyWebsiteUrl,
                "Madrid",
                "Tech",
                null,
                false,
                TIMESTAMP,
                TIMESTAMP);
    }

    private static Principal authenticatedUser() {
        return () -> USER_ID_VALUE;
    }
}
