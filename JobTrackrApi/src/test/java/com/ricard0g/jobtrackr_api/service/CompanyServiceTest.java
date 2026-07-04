package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyCreateRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyPutRequestDto;
import com.ricard0g.jobtrackr_api.dto.CompanyDto.CompanyResponseDto;
import com.ricard0g.jobtrackr_api.exception.CompanyNotFoundException;
import com.ricard0g.jobtrackr_api.exception.DuplicateCompanyNameException;
import com.ricard0g.jobtrackr_api.model.Company;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.CompanyRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class CompanyServiceTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final Long COMPANY_ID = 1L;

    @Mock
    private UserRepository userRepository;

    @Mock
    private CompanyRepository companyRepository;

    @Mock
    private ApplicationRepository applicationRepository;

    @InjectMocks
    private CompanyService companyService;

    @Test
    void getAllCompanies_returnsGlobalAndUserCompanies() {
        // given
        final Company globalCompany = sampleGlobalCompany();
        final Company userCompany = Company.create(sampleUser(), "Acme Corp", null, null, null, null);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(sampleUser()));
        when(companyRepository.findAllGlobalAndByUserId(USER_ID)).thenReturn(List.of(globalCompany, userCompany));

        // when
        final List<CompanyResponseDto> companies = companyService.getAllCompanies(USER_ID);

        // then
        assertThat(companies).hasSize(2);
        assertThat(companies).extracting(CompanyResponseDto::global).containsExactlyInAnyOrder(true, false);
    }

    @Test
    void getCompanyById_whenAccessible_returnsCompany() {
        // given
        final Company company = sampleGlobalCompany();
        when(companyRepository.findByCompanyIdAndAccessibleToUser(COMPANY_ID, USER_ID))
                .thenReturn(Optional.of(company));

        // when
        final CompanyResponseDto response = companyService.getCompanyById(USER_ID, COMPANY_ID);

        // then
        assertThat(response.companyName()).isEqualTo("Google");
        assertThat(response.global()).isTrue();
    }

    @Test
    void getCompanyById_whenNotAccessible_throwsNotFound() {
        // given
        when(companyRepository.findByCompanyIdAndAccessibleToUser(COMPANY_ID, USER_ID))
                .thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> companyService.getCompanyById(USER_ID, COMPANY_ID))
                .isInstanceOf(CompanyNotFoundException.class);
    }

    @Test
    void createCompany_whenNameAvailable_createsUserOwnedCompany() {
        // given
        final User user = sampleUser();
        final CompanyCreateRequestDto request =
                new CompanyCreateRequestDto("Acme Corp", "https://www.acme.com", null, null, null);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(companyRepository.existsGlobalByCompanyName("Acme Corp")).thenReturn(false);
        when(companyRepository.nameExistsForUser(USER_ID, "Acme Corp")).thenReturn(false);
        when(companyRepository.save(any(Company.class))).thenAnswer(invocation -> {
            final Company saved = invocation.getArgument(0);
            saved.setCompanyId(COMPANY_ID);
            return saved;
        });

        // when
        final CompanyResponseDto response = companyService.createCompany(USER_ID, request);

        // then
        assertThat(response.companyName()).isEqualTo("Acme Corp");
        assertThat(response.global()).isFalse();
        assertThat(response.companyLogo()).isEqualTo("https://logos.hunter.io/acme.com");
        verify(companyRepository).save(any(Company.class));
    }

    @Test
    void createCompany_whenGlobalNameExists_throwsDuplicate() {
        // given
        final CompanyCreateRequestDto request = new CompanyCreateRequestDto("Google", null, null, null, null);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(sampleUser()));
        when(companyRepository.existsGlobalByCompanyName("Google")).thenReturn(true);

        // when / then
        assertThatThrownBy(() -> companyService.createCompany(USER_ID, request))
                .isInstanceOf(DuplicateCompanyNameException.class);
        verify(companyRepository, never()).save(any(Company.class));
    }

    @Test
    void replaceCompany_whenGlobalCompany_throwsNotFound() {
        // given
        final CompanyPutRequestDto request = new CompanyPutRequestDto("Google", null, null, null, null);
        when(companyRepository.findByCompanyIdAndUser_UserId(COMPANY_ID, USER_ID)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> companyService.replaceCompany(USER_ID, COMPANY_ID, request))
                .isInstanceOf(CompanyNotFoundException.class);
    }

    @Test
    void deleteCompany_whenGlobalCompany_throwsNotFound() {
        // given
        when(companyRepository.findByCompanyIdAndUser_UserId(COMPANY_ID, USER_ID)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> companyService.deleteCompany(USER_ID, COMPANY_ID))
                .isInstanceOf(CompanyNotFoundException.class);
        verify(companyRepository, never()).delete(any(Company.class));
    }

    @Test
    void deleteCompany_whenUserOwned_deletesCompany() {
        // given
        final Company company = Company.create(sampleUser(), "Acme Corp", null, null, null, null);
        when(companyRepository.findByCompanyIdAndUser_UserId(COMPANY_ID, USER_ID)).thenReturn(Optional.of(company));
        when(applicationRepository.hasApplications(COMPANY_ID)).thenReturn(false);

        // when
        companyService.deleteCompany(USER_ID, COMPANY_ID);

        // then
        verify(companyRepository).delete(company);
    }

    private static User sampleUser() {
        return mock(User.class);
    }

    private static Company sampleGlobalCompany() {
        final Company company = mock(Company.class);
        when(company.getCompanyName()).thenReturn("Google");
        when(company.getUser()).thenReturn(null);
        when(company.isGlobal()).thenReturn(true);
        return company;
    }
}
