-- Phase 6A social beta: friends graph, blocks, invites, activity, and attendance intents.
-- Idempotent for the dedicated Supabase development project.

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT friendships_distinct_users_check CHECK (requester_user_id <> addressee_user_id),
  CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted', 'declined'))
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_uq
  ON friendships (
    LEAST(requester_user_id::text, addressee_user_id::text),
    GREATEST(requester_user_id::text, addressee_user_id::text)
  );

CREATE INDEX IF NOT EXISTS idx_friendships_requester_status
  ON friendships (requester_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee_status
  ON friendships (addressee_user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CONSTRAINT blocked_users_distinct_users_check CHECK (blocker_user_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked
  ON blocked_users (blocked_user_id, blocker_user_id);

CREATE TABLE IF NOT EXISTS friend_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  last_accepted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_friend_invites_user_active
  ON friend_invites (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  parent_activity_id UUID REFERENCES activity_events(id) ON DELETE CASCADE,
  source_signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'friends',
  signal_kind TEXT,
  text TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activity_events_type_check CHECK (
    type IN ('signal', 'coming', 'comment', 'emoji_signal')
  ),
  CONSTRAINT activity_events_visibility_check CHECK (visibility IN ('friends')),
  CONSTRAINT activity_events_signal_kind_check CHECK (
    signal_kind IS NULL OR signal_kind IN ('packed', 'short_line', 'long_line', 'dead', 'event_live')
  ),
  CONSTRAINT activity_events_comment_length_check CHECK (
    text IS NULL OR char_length(text) <= 140
  )
);

CREATE INDEX IF NOT EXISTS idx_activity_events_actor_created
  ON activity_events (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_venue_expires
  ON activity_events (venue_id, expires_at DESC)
  WHERE parent_activity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_activity_events_parent_created
  ON activity_events (parent_activity_id, created_at ASC)
  WHERE parent_activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_events_market_expires
  ON activity_events (market_id, expires_at DESC)
  WHERE parent_activity_id IS NULL;

CREATE TABLE IF NOT EXISTS attendance_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  activity_id UUID REFERENCES activity_events(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_intents_status_check CHECK (status IN ('active', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_intents_active_user_venue_uq
  ON attendance_intents (user_id, venue_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_attendance_intents_venue_active
  ON attendance_intents (venue_id, expires_at DESC)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_friendships_updated_at ON friendships;
CREATE TRIGGER trg_friendships_updated_at BEFORE UPDATE ON friendships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_friend_invites_updated_at ON friend_invites;
CREATE TRIGGER trg_friend_invites_updated_at BEFORE UPDATE ON friend_invites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_activity_events_updated_at ON activity_events;
CREATE TRIGGER trg_activity_events_updated_at BEFORE UPDATE ON activity_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_attendance_intents_updated_at ON attendance_intents;
CREATE TRIGGER trg_attendance_intents_updated_at BEFORE UPDATE ON attendance_intents
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
      target_type IN ('venue', 'event', 'user', 'profile', 'activity', 'signal', 'asset')
    );
END $$;

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_intents ENABLE ROW LEVEL SECURITY;
