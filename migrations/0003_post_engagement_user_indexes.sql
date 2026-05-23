-- Add indexes on post_likes(user_id) and post_views(user_id).
--
-- Without these, account-deletion (ON DELETE CASCADE driven by FK on user_id,
-- and any app-side cleanup that filters by user_id) does a full-table scan
-- on post_likes / post_views. Cost grows linearly as engagement accumulates.
--
-- The post_id side already has idx_post_likes_post / idx_post_views_post from
-- the initial schema; this is the symmetric pair on user_id.
--
-- Sentinel finding #1308 (GSH hardening audit 2026-05-22).

CREATE INDEX idx_post_likes_user ON post_likes(user_id);
CREATE INDEX idx_post_views_user ON post_views(user_id);
