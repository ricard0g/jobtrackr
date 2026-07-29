package com.ricard0g.jobtrackr_api.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;

import com.ricard0g.jobtrackr_api.model.Application;
import com.ricard0g.jobtrackr_api.model.ApplicationCv;
import com.ricard0g.jobtrackr_api.model.Company;
import com.ricard0g.jobtrackr_api.model.User;
import com.ricard0g.jobtrackr_api.model.enums.GeneratedCvFormat;
import com.ricard0g.jobtrackr_api.service.GeneratedCvSortKey;

@DataJpaTest(
        properties = {
            "spring.flyway.enabled=false",
            "spring.data.jpa.repositories.enabled=false",
            "spring.jpa.hibernate.ddl-auto=create-drop",
            "spring.jpa.properties.hibernate.dialect="
                    + "com.ricard0g.jobtrackr_api.repository.H2NamedEnumDialect",
            "spring.datasource.url=jdbc:h2:mem:generated-cv-sort;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
            "spring.sql.init.mode=always",
            "spring.sql.init.schema-locations=classpath:h2-domains.sql"
        })
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class ApplicationCvRepositoryTest {

    private static final int PAGE_SIZE = 10;

    @Autowired
    private TestEntityManager entityManager;

    private ApplicationCvRepository repository;

    private User user;
    private ApplicationCv alpha;
    private ApplicationCv beta;
    private ApplicationCv gamma;
    private ApplicationCv alphaTie;

    @BeforeEach
    void persistGeneratedCvLibrary() {
        repository = new JpaRepositoryFactory(entityManager.getEntityManager())
                .getRepository(ApplicationCvRepository.class);
        user = entityManager.persist(User.localAccount("sort@example.com", "hash", "Sort User"));
        alpha = persistCv("Beta", "zeta.pdf", GeneratedCvFormat.PDF, 100L, 2);
        beta = persistCv("Acme", "alpha.docx", GeneratedCvFormat.DOCX, 300L, 1);
        gamma = persistCv("Ceta", "middle.md", GeneratedCvFormat.MARKDOWN, 200L, 3);
        alphaTie = persistCv("Acme", "omega.pdf", GeneratedCvFormat.PDF, 400L, 4);
        entityManager.flush();
        entityManager.clear();
    }

    @ParameterizedTest
    @CsvSource({
        "NAME, ASC, beta,gamma,alphaTie,alpha",
        "NAME, DESC, alpha,alphaTie,gamma,beta",
        "TYPE, ASC, beta,gamma,alpha,alphaTie",
        "TYPE, DESC, alphaTie,alpha,gamma,beta",
        "SIZE, ASC, alpha,gamma,beta,alphaTie",
        "SIZE, DESC, alphaTie,beta,gamma,alpha",
        "CREATED, ASC, alpha,beta,gamma,alphaTie",
        "CREATED, DESC, alphaTie,gamma,beta,alpha",
        "VERSION, ASC, beta,alpha,gamma,alphaTie",
        "VERSION, DESC, alphaTie,gamma,alpha,beta",
        "COMPANY, ASC, beta,alphaTie,alpha,gamma",
        "COMPANY, DESC, gamma,alpha,alphaTie,beta"
    })
    void sortsGeneratedCvIdsAcrossPersistenceAndAssociationProperties(
            final GeneratedCvSortKey sortKey,
            final Sort.Direction direction,
            final String first,
            final String second,
            final String third,
            final String fourth) {
        // given
        final PageRequest pageRequest = PageRequest.of(0, PAGE_SIZE, sortKey.toSort(direction));

        // when
        final Page<Long> ids =
                repository.findIdsByApplication_User_UserId(user.getUserId(), pageRequest);

        // then
        assertThat(ids.getContent()).containsExactly(
                cv(first).getApplicationCvId(),
                cv(second).getApplicationCvId(),
                cv(third).getApplicationCvId(),
                cv(fourth).getApplicationCvId());
    }

    @Test
    void returnsTheFinalCompletePageAtTheRequestedBoundary() {
        // given
        final PageRequest pageRequest =
                PageRequest.of(1, 2, GeneratedCvSortKey.NAME.toSort(Sort.Direction.ASC));

        // when
        final Page<Long> ids =
                repository.findIdsByApplication_User_UserId(user.getUserId(), pageRequest);

        // then
        assertThat(ids.getNumber()).isEqualTo(1);
        assertThat(ids.getTotalElements()).isEqualTo(4);
        assertThat(ids.getTotalPages()).isEqualTo(2);
        assertThat(ids.getContent()).containsExactly(
                alphaTie.getApplicationCvId(), alpha.getApplicationCvId());
    }

    private ApplicationCv persistCv(
            final String companyName,
            final String filename,
            final GeneratedCvFormat format,
            final long byteSize,
            final int version) {
        final Company company = entityManager.persist(
                Company.create(user, companyName, null, null, null, null));
        entityManager
                .getEntityManager()
                .createNativeQuery("""
                        INSERT INTO applications (
                            application_user_id,
                            application_company_id,
                            application_title,
                            application_status,
                            application_kanban_order,
                            application_created_at,
                            application_updated_at
                        ) VALUES (:userId, :companyId, :title, 'APPLIED', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """)
                .setParameter("userId", user.getUserId())
                .setParameter("companyId", company.getCompanyId())
                .setParameter("title", filename)
                .executeUpdate();
        final Number applicationId = (Number) entityManager
                .getEntityManager()
                .createNativeQuery("SELECT MAX(application_id) FROM applications")
                .getSingleResult();
        final Application application = entityManager
                .getEntityManager()
                .getReference(Application.class, applicationId.longValue());
        return entityManager.persist(ApplicationCv.create(
                application,
                version,
                "users/" + user.getUserId() + "/generated-cvs/" + filename,
                filename,
                format,
                format.contentType(),
                byteSize,
                "sha-" + filename,
                null));
    }

    private ApplicationCv cv(final String name) {
        return switch (name) {
            case "alpha" -> alpha;
            case "beta" -> beta;
            case "gamma" -> gamma;
            case "alphaTie" -> alphaTie;
            default -> throw new IllegalArgumentException("Unknown fixture");
        };
    }
}
