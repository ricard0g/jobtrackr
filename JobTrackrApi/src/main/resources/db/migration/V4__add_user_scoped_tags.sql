ALTER TABLE tags
    ADD COLUMN tag_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE tags DROP CONSTRAINT tags_tag_name_key;

CREATE UNIQUE INDEX tags_global_name_unique
    ON tags (tag_name) WHERE tag_user_id IS NULL;

CREATE UNIQUE INDEX tags_user_name_unique
    ON tags (tag_user_id, tag_name) WHERE tag_user_id IS NOT NULL;

CREATE INDEX idx_tags_user_id ON tags (tag_user_id);

INSERT INTO tags (tag_category, tag_name, tag_color, tag_user_id) VALUES
    ('MODALITY', 'Remote', '#808080', NULL),
    ('MODALITY', 'Hybrid', '#808080', NULL),
    ('MODALITY', 'On-site', '#808080', NULL),
    ('COMPANY_TYPE', 'Startup', '#808080', NULL),
    ('COMPANY_TYPE', 'Enterprise', '#808080', NULL),
    ('COMPANY_TYPE', 'Agency', '#808080', NULL),
    ('TECH_STACK', 'Java', '#808080', NULL),
    ('TECH_STACK', 'Python', '#808080', NULL),
    ('TECH_STACK', 'JavaScript', '#808080', NULL),
    ('TECH_STACK', 'TypeScript', '#808080', NULL),
    ('TECH_STACK', 'React', '#808080', NULL),
    ('TECH_STACK', 'Spring', '#808080', NULL),
    ('OTHER', 'Referral', '#808080', NULL),
    ('OTHER', 'Dream Job', '#808080', NULL)
ON CONFLICT (tag_name) WHERE tag_user_id IS NULL DO NOTHING;
