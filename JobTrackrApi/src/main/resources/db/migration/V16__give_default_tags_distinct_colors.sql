UPDATE tags AS tag
SET tag_color = palette.tag_color
FROM (VALUES
    ('MODALITY', 'Remote', '#0D9488'),
    ('MODALITY', 'Hybrid', '#8B5CF6'),
    ('MODALITY', 'On-site', '#64748B'),
    ('COMPANY_TYPE', 'Startup', '#F97316'),
    ('COMPANY_TYPE', 'Enterprise', '#1E40AF'),
    ('COMPANY_TYPE', 'Agency', '#E11D48'),
    ('TECH_STACK', 'Java', '#E76F00'),
    ('TECH_STACK', 'Python', '#3776AB'),
    ('TECH_STACK', 'JavaScript', '#C5A900'),
    ('TECH_STACK', 'TypeScript', '#3178C6'),
    ('TECH_STACK', 'React', '#149ECA'),
    ('TECH_STACK', 'Spring', '#6DB33F'),
    ('OTHER', 'Referral', '#16A34A'),
    ('OTHER', 'Dream Job', '#D97706')
) AS palette(tag_category, tag_name, tag_color)
WHERE tag.tag_user_id IS NULL
    AND tag.tag_category::text = palette.tag_category
    AND tag.tag_name = palette.tag_name;
