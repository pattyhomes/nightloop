-- Phase 6B decision sessions: private friend-scoped group voting rooms.
-- Idempotent for the dedicated Supabase development project.

CREATE TABLE IF NOT EXISTS decision_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  token_hash TEXT UNIQUE,
  code_hint TEXT,
  code_revoked_at TIMESTAMPTZ,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT decision_sessions_status_check CHECK (status IN ('active', 'ended', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_decision_sessions_creator_status
  ON decision_sessions (creator_user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_sessions_market_expires
  ON decision_sessions (market_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_sessions_token_active
  ON decision_sessions (token_hash, expires_at DESC)
  WHERE code_revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS decision_session_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES decision_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'invited',
  source TEXT NOT NULL DEFAULT 'invited',
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT decision_session_members_role_check CHECK (role IN ('creator', 'member')),
  CONSTRAINT decision_session_members_status_check CHECK (status IN ('invited', 'joined')),
  CONSTRAINT decision_session_members_source_check CHECK (source IN ('creator', 'invited', 'code')),
  UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_session_members_user_status
  ON decision_session_members (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_session_members_session_status
  ON decision_session_members (session_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS decision_session_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES decision_sessions(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  original_rank INTEGER NOT NULL,
  base_score NUMERIC NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, venue_id),
  CONSTRAINT decision_session_candidates_rank_check CHECK (original_rank > 0)
);

CREATE INDEX IF NOT EXISTS idx_decision_session_candidates_session_rank
  ON decision_session_candidates (session_id, original_rank ASC);

CREATE TABLE IF NOT EXISTS decision_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES decision_sessions(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES decision_session_candidates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT decision_votes_vote_check CHECK (vote IN ('in', 'skip')),
  UNIQUE (session_id, candidate_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_votes_session_candidate
  ON decision_votes (session_id, candidate_id, vote);

CREATE INDEX IF NOT EXISTS idx_decision_votes_user
  ON decision_votes (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_decision_sessions_updated_at ON decision_sessions;
CREATE TRIGGER trg_decision_sessions_updated_at BEFORE UPDATE ON decision_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_decision_session_members_updated_at ON decision_session_members;
CREATE TRIGGER trg_decision_session_members_updated_at BEFORE UPDATE ON decision_session_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_decision_votes_updated_at ON decision_votes;
CREATE TRIGGER trg_decision_votes_updated_at BEFORE UPDATE ON decision_votes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE decision_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_session_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_session_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_votes ENABLE ROW LEVEL SECURITY;
