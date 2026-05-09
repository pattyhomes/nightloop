-- Phase 6C.1 social design realignment: two-stage decision rooms and Friends Tonight groups.
-- Idempotent for the dedicated Supabase development project.

ALTER TABLE decision_sessions
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'swiping',
  ADD COLUMN IF NOT EXISTS shortlist_unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shortlist_unlocked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shortlist_unlock_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_sessions_stage_check'
  ) THEN
    ALTER TABLE decision_sessions
      ADD CONSTRAINT decision_sessions_stage_check
      CHECK (stage IN ('swiping', 'shortlist_voting', 'finalized'));
  END IF;
END $$;

UPDATE decision_sessions
SET stage = 'finalized'
WHERE finalized_at IS NOT NULL
  AND stage <> 'finalized';

CREATE TABLE IF NOT EXISTS decision_shortlist_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES decision_sessions(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES decision_session_candidates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id),
  UNIQUE (session_id, candidate_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_shortlist_votes_session_candidate
  ON decision_shortlist_votes (session_id, candidate_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_shortlist_votes_user
  ON decision_shortlist_votes (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_decision_shortlist_votes_updated_at ON decision_shortlist_votes;
CREATE TRIGGER trg_decision_shortlist_votes_updated_at BEFORE UPDATE ON decision_shortlist_votes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE decision_shortlist_votes ENABLE ROW LEVEL SECURITY;
