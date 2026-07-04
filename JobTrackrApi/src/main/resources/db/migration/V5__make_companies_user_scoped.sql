ALTER TABLE companies
    ALTER COLUMN company_user_id DROP NOT NULL;

ALTER TABLE companies DROP CONSTRAINT companies_company_user_id_company_name_key;

CREATE UNIQUE INDEX companies_global_name_unique
    ON companies (company_name) WHERE company_user_id IS NULL;

CREATE UNIQUE INDEX companies_user_name_unique
    ON companies (company_user_id, company_name) WHERE company_user_id IS NOT NULL;

CREATE INDEX idx_companies_user_id ON companies (company_user_id) WHERE company_user_id IS NOT NULL;
