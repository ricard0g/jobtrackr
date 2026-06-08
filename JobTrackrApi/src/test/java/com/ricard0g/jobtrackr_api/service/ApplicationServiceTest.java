package com.ricard0g.jobtrackr_api.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationPatchRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.ApplicationDto.ApplicationStatusPatchRequestDto;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.Company;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.ApplicationStatus;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.CompanyRepository;
import com.ricard0g.jobtrackr_api.repository.TagRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class ApplicationServiceTest {

    private static final Long USER_ID = 1L;
    private static final Long APPLICATION_ID = 2L;
    private static final Long COMPANY_ID = 5L;

    @Mock
    private UserRepository userRepository;

    @Mock
    private CompanyRepository companyRepository;

    @Mock
    private ApplicationRepository applicationRepository;

    @Mock
    private TagRepository tagRepository;

    @Mock
    private StatusHistoryService statusHistoryService;

    @InjectMocks
    private ApplicationService applicationService;

    @Test
    void patchApplicationStatus_whenStatusChanges_recordsHistory() {
        // given
        final Application application = sampleApplication(ApplicationStatus.APPLIED);
        when(applicationRepository.findForUserWithLock(APPLICATION_ID, USER_ID)).thenReturn(Optional.of(application));
        when(applicationRepository.save(application)).thenReturn(application);
        final ApplicationStatusPatchRequestDto dto = new ApplicationStatusPatchRequestDto(ApplicationStatus.IN_REVIEW);

        // when
        applicationService.patchApplicationStatus(USER_ID, APPLICATION_ID, dto);

        // then
        verify(applicationRepository).findForUserWithLock(APPLICATION_ID, USER_ID);
        verify(statusHistoryService)
                .recordStatusChange(application, ApplicationStatus.APPLIED, ApplicationStatus.IN_REVIEW);
        verify(applicationRepository).save(application);
    }

    @Test
    void patchApplicationStatus_whenStatusUnchanged_doesNotRecordHistory() {
        // given
        final Application application = sampleApplication(ApplicationStatus.APPLIED);
        when(applicationRepository.findForUserWithLock(APPLICATION_ID, USER_ID)).thenReturn(Optional.of(application));
        when(applicationRepository.save(application)).thenReturn(application);
        final ApplicationStatusPatchRequestDto dto = new ApplicationStatusPatchRequestDto(ApplicationStatus.APPLIED);

        // when
        applicationService.patchApplicationStatus(USER_ID, APPLICATION_ID, dto);

        // then
        verify(applicationRepository).findForUserWithLock(APPLICATION_ID, USER_ID);
        verify(statusHistoryService, never()).recordStatusChange(any(), any(), any());
        verify(applicationRepository).save(application);
    }

    @Test
    void patchApplication_doesNotRecordHistory() {
        // given
        final Application application = sampleApplication(ApplicationStatus.APPLIED);
        when(applicationRepository.findForUser(APPLICATION_ID, USER_ID)).thenReturn(Optional.of(application));
        when(applicationRepository.save(application)).thenReturn(application);
        final ApplicationPatchRequestDto dto = new ApplicationPatchRequestDto(
                null, "Updated Title", null, null, null, null, null, null, null, null, null, null, null);

        // when
        applicationService.patchApplication(USER_ID, APPLICATION_ID, dto);

        // then
        verify(statusHistoryService, never()).recordStatusChange(any(), any(), any());
    }

    @Test
    void replaceApplication_doesNotRecordHistory() {
        // given
        final Application application = sampleApplication(ApplicationStatus.APPLIED);
        final Company company = application.getCompany();
        when(applicationRepository.findForUser(APPLICATION_ID, USER_ID)).thenReturn(Optional.of(application));
        when(companyRepository.findForUser(COMPANY_ID, USER_ID)).thenReturn(Optional.of(company));
        when(applicationRepository.save(application)).thenReturn(application);
        final ApplicationPutRequestDto dto = new ApplicationPutRequestDto(
                COMPANY_ID, "Updated Title", null, null, null, null, null, null, null, null, null);

        // when
        applicationService.replaceApplication(USER_ID, APPLICATION_ID, dto);

        // then
        verify(statusHistoryService, never()).recordStatusChange(any(), any(), any());
        verify(applicationRepository).save(application);
    }

    private static Application sampleApplication(final ApplicationStatus status) {
        final User user = mock(User.class);
        when(user.getUserId()).thenReturn(USER_ID);
        final Company company = sampleCompany();
        final Application application = mock(Application.class);
        when(application.getApplicationId()).thenReturn(APPLICATION_ID);
        when(application.getUser()).thenReturn(user);
        when(application.getCompany()).thenReturn(company);
        when(application.getApplicationTitle()).thenReturn("Backend Engineer");
        when(application.getApplicationStatus()).thenReturn(status);
        when(application.getApplicationKanbanOrder()).thenReturn(0);
        when(application.getTags()).thenReturn(new HashSet<>());
        when(application.getApplicationCreatedAt()).thenReturn(OffsetDateTime.parse("2026-06-04T12:00:00Z"));
        when(application.getApplicationUpdatedAt()).thenReturn(OffsetDateTime.parse("2026-06-04T12:00:00Z"));
        return application;
    }

    private static Company sampleCompany() {
        final User companyUser = mock(User.class);
        when(companyUser.getUserId()).thenReturn(USER_ID);
        final Company company = mock(Company.class);
        when(company.getCompanyId()).thenReturn(COMPANY_ID);
        when(company.getUser()).thenReturn(companyUser);
        when(company.getCompanyName()).thenReturn("Acme Corp");
        when(company.getCompanyCreatedAt()).thenReturn(OffsetDateTime.parse("2026-06-04T12:00:00Z"));
        when(company.getCompanyUpdatedAt()).thenReturn(OffsetDateTime.parse("2026-06-04T12:00:00Z"));
        return company;
    }
}
