package com.ricard0g.jobtrackr_api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
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

import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationResponseDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationStatusPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.StatusHistoryDto.StatusHistoryResponseDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.CreateTagRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyResponseDto;
import com.ricard0g.jobtrackr_api.dto.TagDto.TagResponseDto;
import com.ricard0g.jobtrackr_api.exception.ApplicationNotFoundException;
import com.ricard0g.jobtrackr_api.exception.CompanyNotFoundException;
import com.ricard0g.jobtrackr_api.exception.DuplicateTagNameException;
import com.ricard0g.jobtrackr_api.exception.GlobalExceptionHandler;
import com.ricard0g.jobtrackr_api.exception.InvalidApplicationSalaryRangeException;
import com.ricard0g.jobtrackr_api.exception.TagNotFoundException;
import com.ricard0g.jobtrackr_api.exception.TooManyApplicationTagsException;
import com.ricard0g.jobtrackr_api.exception.UserNotFoundException;
import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.model.enums.RemoteType;
import com.ricard0g.jobtrackr_api.model.enums.TagCategory;
import com.ricard0g.jobtrackr_api.service.ApplicationService;

@WebMvcTest(controllers = ApplicationController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class ApplicationControllerTest {

    private static final String USER_ID_VALUE = "11111111-1111-1111-1111-111111111111";
    private static final UUID USER_ID = UUID.fromString(USER_ID_VALUE);
    private static final String BASE_PATH = "/api/v1/users/" + USER_ID_VALUE + "/applications";
    private static final OffsetDateTime TIMESTAMP = OffsetDateTime.parse("2026-06-04T12:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ApplicationService applicationService;

    @Test
    void getAllApplications_returns200() throws Exception {
        // given
        final ApplicationResponseDto application = sampleApplication(1L, "Backend Engineer");
        when(applicationService.getAllApplications(USER_ID)).thenReturn(List.of(application));

        // when / then
        mockMvc.perform(get(BASE_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].applicationId").value(1))
                .andExpect(jsonPath("$[0].applicationTitle").value("Backend Engineer"))
                .andExpect(jsonPath("$[0].company.companyId").value(5))
                .andExpect(jsonPath("$[0].company.companyName").value("Acme Corp"));
    }

    @Test
    void getAllApplications_whenUserNotFound_returns404() throws Exception {
        // given
        when(applicationService.getAllApplications(USER_ID)).thenThrow(new UserNotFoundException(USER_ID));

        // when / then
        mockMvc.perform(get(BASE_PATH))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void getAllApplications_withInvalidUserId_returns400() throws Exception {
        // when / then
        mockMvc.perform(get("/api/v1/users/not-a-uuid/applications")).andExpect(status().isBadRequest());
    }

    @Test
    void getApplicationById_returns200() throws Exception {
        // given
        final ApplicationResponseDto application = sampleApplication(2L, "Staff Engineer");
        when(applicationService.getApplicationById(USER_ID, 2L)).thenReturn(application);

        // when / then
        mockMvc.perform(get(BASE_PATH + "/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applicationId").value(2))
                .andExpect(jsonPath("$.applicationTitle").value("Staff Engineer"))
                .andExpect(jsonPath("$.company.companyName").value("Acme Corp"));
    }

    @Test
    void getApplicationById_whenNotFound_returns404() throws Exception {
        // given
        when(applicationService.getApplicationById(USER_ID, 99L))
                .thenThrow(new ApplicationNotFoundException(USER_ID, 99L));

        // when / then
        mockMvc.perform(get(BASE_PATH + "/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    @Test
    void getApplicationById_withInvalidApplicationId_returns400() throws Exception {
        // when / then
        mockMvc.perform(get(BASE_PATH + "/0")).andExpect(status().isBadRequest());
    }

    @Test
    void createApplication_withValidBody_returns201() throws Exception {
        // given
        final ApplicationResponseDto created = sampleApplication(3L, "Platform Engineer");
        when(applicationService.createApplication(eq(USER_ID), any(ApplicationCreateRequestDto.class)))
                .thenReturn(created);

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "Platform Engineer",
                                          "applicationStatus": "APPLIED",
                                          "applicationJobUrl": "https://jobs.example.com/platform"
                                        }
                                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.applicationId").value(3))
                .andExpect(jsonPath("$.applicationTitle").value("Platform Engineer"))
                .andExpect(jsonPath("$.company.companyId").value(5))
                .andExpect(jsonPath("$.company.companyName").value("Acme Corp"));

        verify(applicationService).createApplication(eq(USER_ID), any(ApplicationCreateRequestDto.class));
    }

    @Test
    void createApplication_withTagIds_returns201() throws Exception {
        // given
        final ApplicationResponseDto created = sampleApplicationWithTags(4L, "DevOps Engineer");
        when(applicationService.createApplication(eq(USER_ID), any(ApplicationCreateRequestDto.class)))
                .thenReturn(created);

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "DevOps Engineer",
                                          "applicationStatus": "IN_REVIEW",
                                          "tagIds": [1, 2]
                                        }
                                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tags[0].tagId").value(1))
                .andExpect(jsonPath("$.tags[1].tagId").value(2));
    }

    @Test
    void createApplication_withBlankTitle_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "",
                                          "applicationStatus": "APPLIED"
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void createApplication_withInvalidJobUrl_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "Engineer",
                                          "applicationStatus": "APPLIED",
                                          "applicationJobUrl": "not-a-url"
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("applicationJobUrl"));
    }

    @Test
    void createApplication_whenUserNotFound_returns404() throws Exception {
        // given
        when(applicationService.createApplication(eq(USER_ID), any(ApplicationCreateRequestDto.class)))
                .thenThrow(new UserNotFoundException(USER_ID));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "Engineer",
                                          "applicationStatus": "APPLIED"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void createApplication_whenCompanyNotFound_returns404() throws Exception {
        // given
        when(applicationService.createApplication(eq(USER_ID), any(ApplicationCreateRequestDto.class)))
                .thenThrow(new CompanyNotFoundException(USER_ID, 99L));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 99,
                                          "applicationTitle": "Engineer",
                                          "applicationStatus": "APPLIED"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COMPANY_NOT_FOUND"));
    }

    @Test
    void createApplication_whenInvalidSalaryRange_returns400() throws Exception {
        // given
        when(applicationService.createApplication(eq(USER_ID), any(ApplicationCreateRequestDto.class)))
                .thenThrow(new InvalidApplicationSalaryRangeException(
                        BigDecimal.valueOf(100000), BigDecimal.valueOf(50000)));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "Engineer",
                                          "applicationStatus": "APPLIED",
                                          "applicationSalaryMin": 100000,
                                          "applicationSalaryMax": 50000
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_APPLICATION_SALARY_RANGE"));
    }

    @Test
    void createApplication_whenTagNotFound_returns404() throws Exception {
        // given
        when(applicationService.createApplication(eq(USER_ID), any(ApplicationCreateRequestDto.class)))
                .thenThrow(new TagNotFoundException(99L));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "Engineer",
                                          "applicationStatus": "APPLIED",
                                          "tagIds": [99]
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TAG_NOT_FOUND"));
    }

    @Test
    void replaceApplication_withValidBody_returns200() throws Exception {
        // given
        final ApplicationResponseDto updated = sampleApplication(2L, "Updated Title");
        when(applicationService.replaceApplication(eq(USER_ID), eq(2L), any(ApplicationPutRequestDto.class)))
                .thenReturn(updated);

        // when / then
        mockMvc.perform(
                        put(BASE_PATH + "/2")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "Updated Title"
                                        }
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applicationId").value(2))
                .andExpect(jsonPath("$.applicationTitle").value("Updated Title"));

        verify(applicationService).replaceApplication(eq(USER_ID), eq(2L), any(ApplicationPutRequestDto.class));
    }

    @Test
    void replaceApplication_whenNotFound_returns404() throws Exception {
        // given
        when(applicationService.replaceApplication(eq(USER_ID), eq(99L), any(ApplicationPutRequestDto.class)))
                .thenThrow(new ApplicationNotFoundException(USER_ID, 99L));

        // when / then
        mockMvc.perform(
                        put(BASE_PATH + "/99")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "companyId": 5,
                                          "applicationTitle": "Updated Title"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    @Test
    void getStatusHistory_returns200() throws Exception {
        // given
        final StatusHistoryResponseDto entry =
                sampleStatusHistory(1L, 2L, ApplicationStatus.APPLIED, ApplicationStatus.IN_REVIEW);
        when(applicationService.getStatusHistory(USER_ID, 2L)).thenReturn(List.of(entry));

        // when / then
        mockMvc.perform(get(BASE_PATH + "/2/status-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].statusHistoryId").value(1))
                .andExpect(jsonPath("$[0].applicationId").value(2))
                .andExpect(jsonPath("$[0].statusHistoryOldStatus").value("APPLIED"))
                .andExpect(jsonPath("$[0].statusHistoryNewStatus").value("IN_REVIEW"));

        verify(applicationService).getStatusHistory(USER_ID, 2L);
    }

    @Test
    void getStatusHistory_whenNotFound_returns404() throws Exception {
        // given
        when(applicationService.getStatusHistory(USER_ID, 99L))
                .thenThrow(new ApplicationNotFoundException(USER_ID, 99L));

        // when / then
        mockMvc.perform(get(BASE_PATH + "/99/status-history"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    @Test
    void patchApplicationStatus_withNewStatus_returns200() throws Exception {
        // given
        final ApplicationResponseDto patched = sampleApplication(2L, "Backend Engineer");
        when(applicationService.patchApplicationStatus(
                eq(USER_ID), eq(2L), any(ApplicationStatusPatchRequestDto.class)))
                .thenReturn(patched);

        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/2/status")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "applicationStatus": "IN_REVIEW"
                                        }
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applicationId").value(2));

        verify(applicationService)
                .patchApplicationStatus(eq(USER_ID), eq(2L), any(ApplicationStatusPatchRequestDto.class));
    }

    @Test
    void patchApplicationStatus_whenNotFound_returns404() throws Exception {
        // given
        when(applicationService.patchApplicationStatus(
                eq(USER_ID), eq(99L), any(ApplicationStatusPatchRequestDto.class)))
                .thenThrow(new ApplicationNotFoundException(USER_ID, 99L));

        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/99/status")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "applicationStatus": "IN_REVIEW"
                                        }
                                        """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    @Test
    void patchApplicationStatus_withMissingStatus_returns400() throws Exception {
        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/2/status")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void patchApplication_withScalarFields_returns200() throws Exception {
        // given
        final ApplicationResponseDto patched = sampleApplication(2L, "Patched Title");
        when(applicationService.patchApplication(eq(USER_ID), eq(2L), any(ApplicationPatchRequestDto.class)))
                .thenReturn(patched);

        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/2")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "applicationTitle": "Patched Title"
                                        }
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applicationTitle").value("Patched Title"));

        verify(applicationService).patchApplication(eq(USER_ID), eq(2L), any(ApplicationPatchRequestDto.class));
    }

    @Test
    void patchApplication_withTagIds_returns200() throws Exception {
        // given
        final ApplicationResponseDto patched = sampleApplicationWithTags(2L, "Tagged Role");
        when(applicationService.patchApplication(eq(USER_ID), eq(2L), any(ApplicationPatchRequestDto.class)))
                .thenReturn(patched);

        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/2")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "addTagIds": [1, 2],
                                          "removeTagIds": [3]
                                        }
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tags[0].tagId").value(1))
                .andExpect(jsonPath("$.tags[1].tagId").value(2));
    }

    @Test
    void patchApplication_whenTooManyTags_returns400() throws Exception {
        // given
        when(applicationService.patchApplication(eq(USER_ID), eq(2L), any(ApplicationPatchRequestDto.class)))
                .thenThrow(new TooManyApplicationTagsException(2L, 50));

        // when / then
        mockMvc.perform(
                        patch(BASE_PATH + "/2")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "addTagIds": [1]
                                        }
                                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TOO_MANY_APPLICATION_TAGS"));
    }

    @Test
    void createAndAttachTag_withValidBody_returns201() throws Exception {
        // given
        final TagResponseDto created = new TagResponseDto(5L, TagCategory.TECH_STACK, "Kotlin", "#AABBCC");
        when(applicationService.createAndAttachTag(eq(USER_ID), eq(2L), any(CreateTagRequestDto.class)))
                .thenReturn(created);

        // when / then
        mockMvc.perform(
                        post(BASE_PATH + "/2/tags")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "tagCategory": "TECH_STACK",
                                          "tagName": "Kotlin",
                                          "tagColor": "#AABBCC"
                                        }
                                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tagId").value(5))
                .andExpect(jsonPath("$.tagName").value("Kotlin"));

        verify(applicationService).createAndAttachTag(eq(USER_ID), eq(2L), any(CreateTagRequestDto.class));
    }

    @Test
    void createAndAttachTag_whenDuplicateName_returns409() throws Exception {
        // given
        when(applicationService.createAndAttachTag(eq(USER_ID), eq(2L), any(CreateTagRequestDto.class)))
                .thenThrow(new DuplicateTagNameException("Kotlin"));

        // when / then
        mockMvc.perform(
                        post(BASE_PATH + "/2/tags")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {
                                          "tagCategory": "TECH_STACK",
                                          "tagName": "Kotlin"
                                        }
                                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_TAG_NAME"));
    }

    @Test
    void deleteApplication_returns204() throws Exception {
        // given
        doNothing().when(applicationService).deleteApplication(USER_ID, 2L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/2")).andExpect(status().isNoContent());

        verify(applicationService).deleteApplication(USER_ID, 2L);
    }

    @Test
    void deleteApplication_whenNotFound_returns404() throws Exception {
        // given
        doThrow(new ApplicationNotFoundException(USER_ID, 99L))
                .when(applicationService)
                .deleteApplication(USER_ID, 99L);

        // when / then
        mockMvc.perform(delete(BASE_PATH + "/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    private static ApplicationResponseDto sampleApplication(final Long applicationId, final String title) {
        return new ApplicationResponseDto(
                applicationId,
                USER_ID,
                title,
                "https://jobs.example.com/role",
                "Remote",
                RemoteType.REMOTE,
                "LinkedIn",
                null,
                null,
                null,
                ApplicationStatus.APPLIED,
                0,
                null,
                TIMESTAMP,
                TIMESTAMP,
                sampleCompany(),
                List.of());
    }

    private static ApplicationResponseDto sampleApplicationWithTags(
            final Long applicationId, final String title) {
        return new ApplicationResponseDto(
                applicationId,
                USER_ID,
                title,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                ApplicationStatus.IN_REVIEW,
                0,
                null,
                TIMESTAMP,
                TIMESTAMP,
                sampleCompany(),
                List.of(
                        new TagResponseDto(1L, TagCategory.TECH_STACK, "Java", "#FF0000"),
                        new TagResponseDto(2L, TagCategory.TECH_STACK, "Spring", "#00FF00")));
    }

    private static CompanyResponseDto sampleCompany() {
        return new CompanyResponseDto(
                5L, USER_ID, "Acme Corp", "https://acme.example", "Madrid", "Tech", null, TIMESTAMP, TIMESTAMP);
    }

    private static StatusHistoryResponseDto sampleStatusHistory(
            final Long statusHistoryId,
            final Long applicationId,
            final ApplicationStatus oldStatus,
            final ApplicationStatus newStatus) {
        return new StatusHistoryResponseDto(
                statusHistoryId, applicationId, oldStatus, newStatus, TIMESTAMP, TIMESTAMP);
    }
}
