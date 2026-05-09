-- Phase 6D room-live foundation: device tokens and room notification preferences.
-- Idempotent for the dedicated Supabase development project.

CREATE TABLE IF NOT EXISTS user_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'ios',
  token_hash TEXT NOT NULL,
  token_value TEXT NOT NULL,
  apns_environment TEXT NOT NULL DEFAULT 'sandbox',
  app_version TEXT,
  build_number TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_device_tokens_platform_check CHECK (platform IN ('ios')),
  CONSTRAINT user_device_tokens_apns_environment_check CHECK (apns_environment IN ('sandbox', 'production')),
  UNIQUE (user_id, token_hash, apns_environment)
);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_active_user
  ON user_device_tokens (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_hash_active
  ON user_device_tokens (token_hash, apns_environment)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  room_invites_enabled BOOLEAN NOT NULL DEFAULT true,
  shortlist_ready_enabled BOOLEAN NOT NULL DEFAULT true,
  final_plan_locked_enabled BOOLEAN NOT NULL DEFAULT true,
  room_messages_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_user_device_tokens_updated_at ON user_device_tokens;
CREATE TRIGGER trg_user_device_tokens_updated_at BEFORE UPDATE ON user_device_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_notification_preferences_updated_at ON user_notification_preferences;
CREATE TRIGGER trg_user_notification_preferences_updated_at BEFORE UPDATE ON user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE user_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
