package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.dto.GeneratedCvDto.GeneratedCvDtos;
import com.ricard0g.jobtrackr_api.exception.CvGenerationException;
import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.ApplicationCv;
import com.ricard0g.jobtrackr_api.model.Company;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.repository.ApplicationCvRepository;
import com.ricard0g.jobtrackr_api.repository.ApplicationRepository;
import com.ricard0g.jobtrackr_api.repository.StorageCleanupJobRepository;
import com.ricard0g.jobtrackr_api.repository.UserRepository;
import com.ricard0g.jobtrackr_api.storage.ObjectStorage;
import com.ricard0g.jobtrackr_api.util.GeneratedCvCursor;

@ExtendWith(MockitoExtension.class)
class ApplicationCvServiceListForUserTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final OffsetDateTime TIE_TIME = OffsetDateTime.parse("2026-07-18T12:00:00Z");

    @Mock
    private UserRepository userRepository;

    @Mock
    private ApplicationRepository applicationRepository;

    @Mock
    private ApplicationCvRepository applicationCvRepository;

    @Mock
    private StorageCleanupJobRepository storageCleanupJobRepository;

    @Mock
    private ObjectStorage objectStorage;

    @Mock
    private CvGenerationProperties properties;

    @InjectMocks
    private ApplicationCvService service;

    @BeforeEach
    void requireUser() {
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));
    }

    @Test
    void listForUser_firstPage_returnsTwentyItemsAndNextCursor() {
        // given
        final List<ApplicationCv> rows = new ArrayList<>();
        for (int index = ApplicationCvService.USER_WIDE_PAGE_SIZE + 1; index >= 2; index--) {
            rows.add(cv((long) index, "App " + index, "Company " + index, TIE_TIME.minusMinutes(index)));
        }
        rows.add(mock(ApplicationCv.class));
        when(applicationCvRepository.findPageForUser(eq(USER_ID), isNull(), isNull(), any(Pageable.class)))
                .thenReturn(rows);

        // when
        final GeneratedCvDtos.Page page = service.listForUser(USER_ID, null);

        // then
        assertThat(page.items()).hasSize(ApplicationCvService.USER_WIDE_PAGE_SIZE);
        assertThat(page.items().getFirst().generatedCvId())
                .isEqualTo((long) ApplicationCvService.USER_WIDE_PAGE_SIZE + 1);
        assertThat(page.items().getFirst().applicationTitle())
                .isEqualTo("App " + (ApplicationCvService.USER_WIDE_PAGE_SIZE + 1));
        assertThat(page.items().getFirst().companyName())
                .isEqualTo("Company " + (ApplicationCvService.USER_WIDE_PAGE_SIZE + 1));
        assertThat(page.items().getLast().generatedCvId()).isEqualTo(2L);
        assertThat(page.nextCursor()).isEqualTo(GeneratedCvCursor.encode(TIE_TIME.minusMinutes(2), 2L));

        final ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(applicationCvRepository)
                .findPageForUser(eq(USER_ID), isNull(), isNull(), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageSize())
                .isEqualTo(ApplicationCvService.USER_WIDE_PAGE_SIZE + 1);
    }

    @Test
    void listForUser_withCursor_requestsKeysetAndOmitsNextCursorOnLastPage() {
        // given
        final String cursor = GeneratedCvCursor.encode(TIE_TIME, 50L);
        final List<ApplicationCv> rows = List.of(
                cv(10L, "Backend Engineer", "Acme", TIE_TIME.minusHours(1)),
                cv(9L, "Backend Engineer", "Acme", TIE_TIME.minusHours(2)));
        when(applicationCvRepository.findPageForUser(
                        eq(USER_ID), eq(TIE_TIME), eq(50L), any(Pageable.class)))
                .thenReturn(rows);

        // when
        final GeneratedCvDtos.Page page = service.listForUser(USER_ID, cursor);

        // then
        assertThat(page.items()).hasSize(2);
        assertThat(page.nextCursor()).isNull();
        assertThat(page.items().getFirst().applicationTitle()).isEqualTo("Backend Engineer");
        assertThat(page.items().getFirst().companyName()).isEqualTo("Acme");
    }

    @Test
    void listForUser_equalTimestamps_preserveIdDescendingOrderFromRepository() {
        // given
        final List<ApplicationCv> rows = List.of(
                cv(30L, "Role A", "Co A", TIE_TIME),
                cv(20L, "Role B", "Co B", TIE_TIME),
                cv(10L, "Role C", "Co C", TIE_TIME));
        when(applicationCvRepository.findPageForUser(eq(USER_ID), isNull(), isNull(), any(Pageable.class)))
                .thenReturn(rows);

        // when
        final GeneratedCvDtos.Page page = service.listForUser(USER_ID, null);

        // then
        assertThat(page.items())
                .extracting(GeneratedCvDtos.Summary::generatedCvId)
                .containsExactly(30L, 20L, 10L);
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void listForUser_invalidCursor_throwsBadRequest() {
        // when / then
        assertThatThrownBy(() -> service.listForUser(USER_ID, "%%%"))
                .isInstanceOf(CvGenerationException.class)
                .extracting(exception -> ((CvGenerationException) exception).getCode())
                .isEqualTo("INVALID_CURSOR");
    }

    private ApplicationCv cv(
            final Long id,
            final String applicationTitle,
            final String companyName,
            final OffsetDateTime createdAt) {
        final Company company = mock(Company.class);
        when(company.getCompanyName()).thenReturn(companyName);

        final Application application = mock(Application.class);
        when(application.getApplicationId()).thenReturn(id * 10);
        when(application.getApplicationTitle()).thenReturn(applicationTitle);
        when(application.getCompany()).thenReturn(company);

        final ApplicationCv applicationCv = mock(ApplicationCv.class);
        when(applicationCv.getApplicationCvId()).thenReturn(id);
        when(applicationCv.getApplication()).thenReturn(application);
        when(applicationCv.getVersion()).thenReturn(1);
        when(applicationCv.getOriginalFilename()).thenReturn("cv-" + id + ".pdf");
        when(applicationCv.getFormat()).thenReturn(GeneratedCvFormat.PDF);
        when(applicationCv.getContentType()).thenReturn("application/pdf");
        when(applicationCv.getByteSize()).thenReturn(1024L);
        when(applicationCv.getGeneration()).thenReturn(null);
        when(applicationCv.getCreatedAt()).thenReturn(createdAt);
        return applicationCv;
    }
}
