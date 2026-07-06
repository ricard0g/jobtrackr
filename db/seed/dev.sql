-- Intentional development seed for local/cloud-agent databases.
-- Run this after Flyway has created the schema and product reference data.
--
-- Login:
--   email: agent@example.test
--   password: dev-password

WITH seed_users AS (
    SELECT user_id
    FROM users
    WHERE user_email IN ('agent@example.test')
)
DELETE FROM saved_views
USING seed_users
WHERE saved_view_user_id = seed_users.user_id;

WITH seed_users AS (
    SELECT user_id
    FROM users
    WHERE user_email IN ('agent@example.test')
)
DELETE FROM cv_base
USING seed_users
WHERE cv_base_user_id = seed_users.user_id;

WITH seed_users AS (
    SELECT user_id
    FROM users
    WHERE user_email IN ('agent@example.test')
)
DELETE FROM applications
USING seed_users
WHERE application_user_id = seed_users.user_id;

WITH seed_users AS (
    SELECT user_id
    FROM users
    WHERE user_email IN ('agent@example.test')
)
DELETE FROM companies
USING seed_users
WHERE company_user_id = seed_users.user_id;

WITH seed_users AS (
    SELECT user_id
    FROM users
    WHERE user_email IN ('agent@example.test')
)
DELETE FROM tags
USING seed_users
WHERE tag_user_id = seed_users.user_id;

DELETE FROM users
WHERE user_email IN ('agent@example.test');

INSERT INTO users (
    user_id,
    user_email,
    user_password_hash,
    user_email_verified,
    user_display_name,
    user_picture_url,
    user_enabled,
    user_locked,
    user_deleted_at,
    user_password_changed_at,
    user_last_login_at,
    user_created_at,
    user_updated_at
)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'agent@example.test',
    '$2a$10$httASw4WJDlb7xck40h7.OZgOszPfqrlak9I7OCj94sqMrFwz5jhq',
    true,
    'Cloud Agent Demo',
    null,
    true,
    false,
    null,
    now(),
    now(),
    now(),
    now()
);

INSERT INTO companies (
    company_user_id,
    company_name,
    company_website_url,
    company_location,
    company_type,
    company_logo,
    company_created_at,
    company_updated_at
)
SELECT
    user_id,
    company_name,
    company_website_url,
    company_location,
    company_type,
    company_logo,
    now(),
    now()
FROM users
CROSS JOIN (
    VALUES
        ('Acme Robotics', 'https://acme-robotics.example.test', 'Madrid, Spain', 'Startup', null),
        ('Northstar Labs', 'https://northstar-labs.example.test', 'Remote, EU', 'SaaS', null),
        ('Bluebird Health', 'https://bluebird-health.example.test', 'Barcelona, Spain', 'Healthtech', null)
) AS seed_company(company_name, company_website_url, company_location, company_type, company_logo)
WHERE user_email = 'agent@example.test';

INSERT INTO tags (
    tag_category,
    tag_name,
    tag_color,
    tag_user_id
)
SELECT
    tag_category::tag_category,
    tag_name,
    tag_color,
    user_id
FROM users
CROSS JOIN (
    VALUES
        ('OTHER', 'High Priority', '#DC2626'),
        ('OTHER', 'Referral', '#7C3AED'),
        ('TECH_STACK', 'Cloud', '#0EA5E9'),
        ('COMPANY_TYPE', 'Product-led', '#16A34A')
) AS seed_tag(tag_category, tag_name, tag_color)
WHERE user_email = 'agent@example.test';

INSERT INTO applications (
    application_user_id,
    application_company_id,
    application_title,
    application_job_url,
    application_location,
    application_remote_type,
    application_source,
    application_salary_min,
    application_salary_max,
    application_currency,
    application_status,
    application_kanban_order,
    application_applied_at,
    application_created_at,
    application_updated_at
)
SELECT
    u.user_id,
    c.company_id,
    app.application_title,
    app.application_job_url,
    app.application_location,
    app.application_remote_type::remote_type,
    app.application_source,
    app.application_salary_min,
    app.application_salary_max,
    app.application_currency,
    app.application_status::application_status,
    app.application_kanban_order,
    app.application_applied_at::timestamptz,
    now(),
    now()
FROM users u
JOIN (
    VALUES
        ('GitHub', null, 'Senior Backend Engineer', 'https://jobs.example.test/github-backend', 'Remote, EU', 'REMOTE', 'LinkedIn', 85000.00, 105000.00, 'EUR', 'APPLIED', 0, now() - interval '8 days'),
        ('Stripe', null, 'Platform Engineer', 'https://jobs.example.test/stripe-platform', 'Madrid, Spain', 'HYBRID', 'Company careers page', 90000.00, 120000.00, 'EUR', 'IN_REVIEW', 0, now() - interval '14 days'),
        ('Acme Robotics', 'agent@example.test', 'Full Stack Engineer', 'https://jobs.example.test/acme-full-stack', 'Madrid, Spain', 'HYBRID', 'Referral', 65000.00, 82000.00, 'EUR', 'INTERVIEW', 0, now() - interval '21 days'),
        ('Northstar Labs', 'agent@example.test', 'Staff Java Engineer', 'https://jobs.example.test/northstar-java', 'Remote, EU', 'REMOTE', 'Recruiter outreach', 110000.00, 140000.00, 'EUR', 'OFFER', 0, now() - interval '30 days'),
        ('Shopify', null, 'Backend Developer', 'https://jobs.example.test/shopify-backend', 'Remote, Americas', 'REMOTE', 'Wellfound', 75000.00, 95000.00, 'USD', 'REJECTED', 0, now() - interval '45 days'),
        ('Bluebird Health', 'agent@example.test', 'Cloud Infrastructure Engineer', 'https://jobs.example.test/bluebird-cloud', 'Barcelona, Spain', 'ON_SITE', 'Meetup', 70000.00, 90000.00, 'EUR', 'WITHDRAWN', 0, now() - interval '60 days')
) AS app(
    company_name,
    company_owner_email,
    application_title,
    application_job_url,
    application_location,
    application_remote_type,
    application_source,
    application_salary_min,
    application_salary_max,
    application_currency,
    application_status,
    application_kanban_order,
    application_applied_at
) ON true
JOIN companies c
    ON c.company_name = app.company_name
    AND (
        (app.company_owner_email IS NULL AND c.company_user_id IS NULL)
        OR c.company_user_id = u.user_id
    )
WHERE u.user_email = 'agent@example.test';

WITH links(application_title, tag_name, user_scoped) AS (
    VALUES
        ('Senior Backend Engineer', 'Java', false),
        ('Senior Backend Engineer', 'Spring', false),
        ('Senior Backend Engineer', 'Remote', false),
        ('Senior Backend Engineer', 'High Priority', true),
        ('Platform Engineer', 'TypeScript', false),
        ('Platform Engineer', 'Cloud', true),
        ('Platform Engineer', 'Hybrid', false),
        ('Full Stack Engineer', 'React', false),
        ('Full Stack Engineer', 'Java', false),
        ('Full Stack Engineer', 'Referral', true),
        ('Staff Java Engineer', 'Java', false),
        ('Staff Java Engineer', 'Spring', false),
        ('Staff Java Engineer', 'Product-led', true),
        ('Backend Developer', 'Python', false),
        ('Backend Developer', 'Remote', false),
        ('Cloud Infrastructure Engineer', 'Cloud', true),
        ('Cloud Infrastructure Engineer', 'On-site', false)
)
INSERT INTO application_tags (
    application_tags_application_id,
    application_tags_tag_id
)
SELECT
    a.application_id,
    t.tag_id
FROM links
JOIN users u
    ON u.user_email = 'agent@example.test'
JOIN applications a
    ON a.application_user_id = u.user_id
    AND a.application_title = links.application_title
JOIN tags t
    ON t.tag_name = links.tag_name
    AND (
        (links.user_scoped AND t.tag_user_id = u.user_id)
        OR (NOT links.user_scoped AND t.tag_user_id IS NULL)
    )
ON CONFLICT DO NOTHING;

INSERT INTO interviews (
    interview_application_id,
    interview_type,
    interview_scheduled_at,
    interview_location,
    interview_notes,
    interview_outcome,
    interview_created_at,
    interview_updated_at
)
SELECT
    a.application_id,
    seed_interview.interview_type::interview_type,
    seed_interview.interview_scheduled_at::timestamptz,
    seed_interview.interview_location,
    seed_interview.interview_notes,
    seed_interview.interview_outcome::interview_outcome,
    now(),
    now()
FROM users u
JOIN applications a
    ON a.application_user_id = u.user_id
JOIN (
    VALUES
        ('Full Stack Engineer', 'TECHNICAL', now() + interval '2 days', 'Google Meet', 'Prepare React state management and Spring security examples.', 'PENDING'),
        ('Staff Java Engineer', 'FINAL', now() + interval '5 days', 'Zoom', 'Discuss architecture tradeoffs and compensation expectations.', 'PENDING'),
        ('Platform Engineer', 'PHONE', now() - interval '3 days', 'Phone', 'Initial recruiter screen completed.', 'PASSED')
) AS seed_interview(application_title, interview_type, interview_scheduled_at, interview_location, interview_notes, interview_outcome)
    ON seed_interview.application_title = a.application_title
WHERE u.user_email = 'agent@example.test';

INSERT INTO status_history (
    status_history_application_id,
    status_history_old_status,
    status_history_new_status,
    status_history_changed_at,
    status_history_created_at
)
SELECT
    a.application_id,
    seed_history.old_status::application_status,
    seed_history.new_status::application_status,
    seed_history.changed_at::timestamptz,
    now()
FROM users u
JOIN applications a
    ON a.application_user_id = u.user_id
JOIN (
    VALUES
        ('Senior Backend Engineer', null, 'APPLIED', now() - interval '8 days'),
        ('Platform Engineer', null, 'APPLIED', now() - interval '14 days'),
        ('Platform Engineer', 'APPLIED', 'IN_REVIEW', now() - interval '9 days'),
        ('Full Stack Engineer', null, 'APPLIED', now() - interval '21 days'),
        ('Full Stack Engineer', 'APPLIED', 'IN_REVIEW', now() - interval '15 days'),
        ('Full Stack Engineer', 'IN_REVIEW', 'INTERVIEW', now() - interval '7 days'),
        ('Staff Java Engineer', null, 'APPLIED', now() - interval '30 days'),
        ('Staff Java Engineer', 'APPLIED', 'INTERVIEW', now() - interval '20 days'),
        ('Staff Java Engineer', 'INTERVIEW', 'OFFER', now() - interval '2 days'),
        ('Backend Developer', null, 'APPLIED', now() - interval '45 days'),
        ('Backend Developer', 'APPLIED', 'REJECTED', now() - interval '10 days'),
        ('Cloud Infrastructure Engineer', null, 'APPLIED', now() - interval '60 days'),
        ('Cloud Infrastructure Engineer', 'APPLIED', 'WITHDRAWN', now() - interval '25 days')
) AS seed_history(application_title, old_status, new_status, changed_at)
    ON seed_history.application_title = a.application_title
WHERE u.user_email = 'agent@example.test';

INSERT INTO application_tasks (
    application_task_application_id,
    application_task_type,
    application_task_title,
    application_task_description,
    application_task_due_at,
    application_task_completed_at,
    application_task_created_at,
    application_task_updated_at
)
SELECT
    a.application_id,
    seed_task.task_type::task_type,
    seed_task.task_title,
    seed_task.task_description,
    seed_task.due_at::timestamptz,
    seed_task.completed_at::timestamptz,
    now(),
    now()
FROM users u
JOIN applications a
    ON a.application_user_id = u.user_id
JOIN (
    VALUES
        ('Senior Backend Engineer', 'FOLLOW_UP', 'Send follow-up note', 'Check whether the hiring manager needs additional project examples.', now() + interval '3 days', null),
        ('Full Stack Engineer', 'INTERVIEW_PREP', 'Prepare technical interview', 'Review drag-and-drop UI state and API pagination examples.', now() + interval '1 day', null),
        ('Staff Java Engineer', 'DEADLINE', 'Review offer package', 'Compare salary, remote policy, and learning budget.', now() + interval '4 days', null),
        ('Platform Engineer', 'FOLLOW_UP', 'Recruiter screen completed', 'Sent availability and portfolio links.', now() - interval '2 days', now() - interval '2 days')
) AS seed_task(application_title, task_type, task_title, task_description, due_at, completed_at)
    ON seed_task.application_title = a.application_title
WHERE u.user_email = 'agent@example.test';

INSERT INTO job_descriptions (
    job_description_application_id,
    job_description_text,
    job_description_fetched_at
)
SELECT
    a.application_id,
    seed_description.description,
    now()
FROM users u
JOIN applications a
    ON a.application_user_id = u.user_id
JOIN (
    VALUES
        ('Senior Backend Engineer', 'Build reliable backend services, own API design, improve database performance, and collaborate with frontend engineers on developer-facing workflows.'),
        ('Full Stack Engineer', 'Develop product features across React and Spring Boot, improve user onboarding, and ship well-tested customer-facing workflows.'),
        ('Staff Java Engineer', 'Lead architecture for high-throughput Java services, mentor backend engineers, and partner with product on roadmap planning.')
) AS seed_description(application_title, description)
    ON seed_description.application_title = a.application_title
WHERE u.user_email = 'agent@example.test';

INSERT INTO saved_views (
    saved_view_user_id,
    saved_view_name,
    saved_view_is_default,
    saved_view_filters_json,
    saved_view_created_at,
    saved_view_updated_at
)
SELECT
    user_id,
    saved_view_name,
    saved_view_is_default,
    saved_view_filters_json::jsonb,
    now(),
    now()
FROM users
CROSS JOIN (
    VALUES
        ('Active pipeline', true, '{"statuses":["APPLIED","IN_REVIEW","INTERVIEW","OFFER"],"sort":"updated_desc"}'),
        ('High priority remote', false, '{"tags":["High Priority"],"remoteTypes":["REMOTE"],"sort":"applied_desc"}')
) AS seed_view(saved_view_name, saved_view_is_default, saved_view_filters_json)
WHERE user_email = 'agent@example.test';

INSERT INTO cv_base (
    cv_base_user_id,
    cv_base_location,
    cv_base_updated_at
)
SELECT
    user_id,
    'r2://jobtrackr-dev/cv-base/cloud-agent-demo.pdf',
    now()
FROM users
WHERE user_email = 'agent@example.test';

INSERT INTO application_cvs (
    application_cv_application_id,
    application_cv_version,
    application_cv_location,
    application_cv_tone,
    application_cv_created_at
)
SELECT
    a.application_id,
    seed_cv.version,
    seed_cv.location,
    seed_cv.tone,
    now()
FROM users u
JOIN applications a
    ON a.application_user_id = u.user_id
JOIN (
    VALUES
        ('Senior Backend Engineer', 1, 'r2://jobtrackr-dev/application-cvs/github-backend-v1.pdf', 'concise'),
        ('Full Stack Engineer', 1, 'r2://jobtrackr-dev/application-cvs/acme-full-stack-v1.pdf', 'product-focused'),
        ('Staff Java Engineer', 1, 'r2://jobtrackr-dev/application-cvs/northstar-java-v1.pdf', 'leadership')
) AS seed_cv(application_title, version, location, tone)
    ON seed_cv.application_title = a.application_title
WHERE u.user_email = 'agent@example.test';
