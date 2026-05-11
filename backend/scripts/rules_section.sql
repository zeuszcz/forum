BEGIN;

-- 1) Create the Rules section (idempotent — skip if exists)
INSERT INTO sections (slug, title, description, icon, accent, display_order, is_locked, thread_count, post_count, created_at, updated_at)
VALUES (
  'rules',
  'Правила сервера',
  'Обязательные правила для всех игроков. Незнание не освобождает от ответственности.',
  'shield',
  'ember',
  3,
  TRUE,
  0,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 2) Move thread #3 (Правила сервера) into the new section + pin it
UPDATE threads
SET section_id = (SELECT id FROM sections WHERE slug='rules'),
    is_pinned = TRUE
WHERE id = 3;

-- 3) Recompute thread_count / post_count for affected sections
UPDATE sections s
SET thread_count = COALESCE((
      SELECT COUNT(*) FROM threads t WHERE t.section_id = s.id AND NOT t.is_deleted
    ), 0),
    post_count = COALESCE((
      SELECT COUNT(*) FROM posts p
      JOIN threads t ON t.id = p.thread_id
      WHERE t.section_id = s.id AND NOT p.is_deleted
    ), 0)
WHERE s.slug IN ('general', 'rules');

-- 4) Set last_thread_id for the rules section
UPDATE sections SET last_thread_id = 3 WHERE slug = 'rules';

COMMIT;

-- Verify
SELECT s.id, s.slug, s.title, s.icon, s.accent, s.thread_count, s.last_thread_id, s.is_locked, s.display_order
FROM sections s
WHERE s.slug IN ('general', 'rules')
ORDER BY s.display_order;
