-- Phase 6C group pick rooms: suggestions, tiny chat, and final plans.
-- Idempotent for the dedicated Supabase development project.

ALTER TABLE decision_sessions
  ADD COLUMN IF NOT EXISTS final_candidate_id UUID,
  ADD COLUMN IF NOT EXISTS final_venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_locked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_meetup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_sessions_final_candidate_fkey'
  ) THEN
    ALTER TABLE decision_sessions
      ADD CONSTRAINT decision_sessions_final_candidate_fkey
      FOREIGN KEY (final_candidate_id)
      REFERENCES decision_session_candidates(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_sessions_final_note_length_check'
  ) THEN
    ALTER TABLE decision_sessions
      ADD CONSTRAINT decision_sessions_final_note_length_check
      CHECK (final_note IS NULL OR char_length(final_note) <= 140);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_sessions_final_meetup_before_expiry_check'
  ) THEN
    ALTER TABLE decision_sessions
      ADD CONSTRAINT decision_sessions_final_meetup_before_expiry_check
      CHECK (final_meetup_at IS NULL OR final_meetup_at <= expires_at);
  END IF;
END $$;

ALTER TABLE decision_session_candidates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS suggested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_session_candidates_source_check'
  ) THEN
    ALTER TABLE decision_session_candidates
      ADD CONSTRAINT decision_session_candidates_source_check
      CHECK (source IN ('initial', 'suggested'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_decision_session_candidates_source
  ON decision_session_candidates (session_id, source, suggested_at DESC);

CREATE TABLE IF NOT EXISTS decision_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES decision_sessions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  text TEXT,
  emoji TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT decision_session_messages_type_check CHECK (type IN ('text', 'emoji')),
  CONSTRAINT decision_session_messages_text_length_check CHECK (
    text IS NULL OR char_length(text) <= 140
  ),
  CONSTRAINT decision_session_messages_emoji_check CHECK (
    emoji IS NULL OR emoji IN ('fire', 'eyes', 'thumbs_up', 'thinking', 'down')
  ),
  CONSTRAINT decision_session_messages_payload_check CHECK (
    (type = 'text' AND text IS NOT NULL AND emoji IS NULL)
    OR (type = 'emoji' AND emoji IS NOT NULL AND text IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_decision_session_messages_session_created
  ON decision_session_messages (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_decision_session_messages_actor
  ON decision_session_messages (actor_user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_decision_session_messages_updated_at ON decision_session_messages;
CREATE TRIGGER trg_decision_session_messages_updated_at BEFORE UPDATE ON decision_session_messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'moderation_reports_target_type_check'
  ) THEN
    ALTER TABLE moderation_reports DROP CONSTRAINT moderation_reports_target_type_check;
  END IF;

  ALTER TABLE moderation_reports
    ADD CONSTRAINT moderation_reports_target_type_check CHECK (
      target_type IN ('venue', 'event', 'user', 'profile', 'activity', 'decision_message', 'signal', 'asset')
    );
END $$;

ALTER TABLE decision_session_messages ENABLE ROW LEVEL SECURITY;
