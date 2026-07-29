package com.ricard0g.jobtrackr_api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import com.ricard0g.jobtrackr_api.config.cvgeneration.CvGenerationProperties;
import com.ricard0g.jobtrackr_api.conversion.GotenbergClient;
import com.ricard0g.jobtrackr_api.dto.GeneratedCvDto.GeneratedCvDtos;
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

@ExtendWith(MockitoExtension.class)
class ApplicationCvServiceListForUserTest {

    private static final UUID USER_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final OffsetDateTime TIE_TIME = OffsetDateTime.parse("2026-07-18T12:00:00Z");
    private static final int PAGE_SIZE = 10;
    private static final Pageable PAGEABLE =
            PageRequest.of(0, PAGE_SIZE, Sort.by(Sort.Direction.DESC, "createdAt", "applicationCvId"));
    private static final GeneratedCvListQuery QUERY =
            new GeneratedCvListQuery(0, PAGE_SIZE, GeneratedCvSortKey.CREATED, Sort.Direction.DESC);

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

    @Mock
    private GotenbergClient gotenbergClient;

    @InjectMocks
    private ApplicationCvService service;

    @BeforeEach
    void requireUser() {
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));
    }

    @Test
    void listForUser_pagesIdsThenFetchesAssociationsPreservingOrder() {
        // given
        final ApplicationCv first = cv(30L, "Backend Engineer", "Acme", TIE_TIME);
        final ApplicationCv second = cv(20L, "Platform Engineer", "Acme", TIE_TIME.minusHours(1));
        when(applicationCvRepository.findIdsByApplication_User_UserId(eq(USER_ID), eq(PAGEABLE)))
                .thenReturn(new PageImpl<>(List.of(30L, 20L), PAGEABLE, 42));
        when(applicationCvRepository.findAllByIdInWithAssociations(List.of(30L, 20L)))
                .thenReturn(List.of(second, first));

        // when
        final GeneratedCvDtos.PageResponse page = service.listForUser(USER_ID, QUERY);

        // then
        assertThat(page.items()).hasSize(2);
        assertThat(page.items().getFirst().generatedCvId()).isEqualTo(30L);
        assertThat(page.items().getFirst().applicationTitle()).isEqualTo("Backend Engineer");
        assertThat(page.items().getFirst().companyName()).isEqualTo("Acme");
        assertThat(page.total()).isEqualTo(42);
        assertThat(page.page()).isZero();
        assertThat(page.size()).isEqualTo(PAGEABLE.getPageSize());
        verify(applicationCvRepository).findIdsByApplication_User_UserId(USER_ID, PAGEABLE);
        verify(applicationCvRepository).findAllByIdInWithAssociations(List.of(30L, 20L));
    }

    @Test
    void listForUser_equalTimestamps_preserveIdDescendingOrderFromIdPage() {
        // given
        final ApplicationCv first = cv(30L, "Role A", "Co A", TIE_TIME);
        final ApplicationCv second = cv(20L, "Role B", "Co B", TIE_TIME);
        final ApplicationCv third = cv(10L, "Role C", "Co C", TIE_TIME);
        when(applicationCvRepository.findIdsByApplication_User_UserId(eq(USER_ID), eq(PAGEABLE)))
                .thenReturn(new PageImpl<>(List.of(30L, 20L, 10L), PAGEABLE, 3));
        when(applicationCvRepository.findAllByIdInWithAssociations(List.of(30L, 20L, 10L)))
                .thenReturn(List.of(third, first, second));

        // when
        final GeneratedCvDtos.PageResponse page = service.listForUser(USER_ID, QUERY);

        // then
        assertThat(page.items())
                .extracting(GeneratedCvDtos.Summary::generatedCvId)
                .containsExactly(30L, 20L, 10L);
    }

    @Test
    void listForUser_whenNoIds_returnsEmptyPageWithoutAssociationFetch() {
        // given
        when(applicationCvRepository.findIdsByApplication_User_UserId(eq(USER_ID), eq(PAGEABLE)))
                .thenReturn(new PageImpl<>(List.of(), PAGEABLE, 0));

        // when
        final GeneratedCvDtos.PageResponse page = service.listForUser(USER_ID, QUERY);

        // then
        assertThat(page.items()).isEmpty();
        assertThat(page.total()).isZero();
        verify(applicationCvRepository).findIdsByApplication_User_UserId(USER_ID, PAGEABLE);
        org.mockito.Mockito.verify(applicationCvRepository, org.mockito.Mockito.never())
                .findAllByIdInWithAssociations(org.mockito.ArgumentMatchers.any());
    }

    @ParameterizedTest
    @CsvSource({
        "NAME, ASC, originalFilename",
        "NAME, DESC, originalFilename",
        "TYPE, ASC, format",
        "TYPE, DESC, format",
        "SIZE, ASC, byteSize",
        "SIZE, DESC, byteSize",
        "CREATED, ASC, createdAt",
        "CREATED, DESC, createdAt",
        "VERSION, ASC, version",
        "VERSION, DESC, version",
        "COMPANY, ASC, application.company.companyName",
        "COMPANY, DESC, application.company.companyName"
    })
    void listForUser_mapsEverySortKeyAndDirectionWithDeterministicTies(
            final GeneratedCvSortKey sortKey,
            final Sort.Direction direction,
            final String persistenceProperty) {
        // given
        when(applicationCvRepository.findIdsByApplication_User_UserId(eq(USER_ID), any(Pageable.class)))
                .thenAnswer(invocation -> {
                    final Pageable pageable = invocation.getArgument(1);
                    return new PageImpl<>(List.of(), pageable, 0);
                });
        final GeneratedCvListQuery query = new GeneratedCvListQuery(2, PAGE_SIZE, sortKey, direction);

        // when
        service.listForUser(USER_ID, query);

        // then
        final ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(applicationCvRepository).findIdsByApplication_User_UserId(eq(USER_ID), pageableCaptor.capture());
        final Pageable pageable = pageableCaptor.getValue();
        assertThat(pageable.getPageNumber()).isEqualTo(2);
        assertThat(pageable.getPageSize()).isEqualTo(PAGE_SIZE);
        assertThat(pageable.getSort().toList())
                .extracting(Sort.Order::getProperty, Sort.Order::getDirection)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(persistenceProperty, direction),
                        org.assertj.core.groups.Tuple.tuple("applicationCvId", direction));
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
