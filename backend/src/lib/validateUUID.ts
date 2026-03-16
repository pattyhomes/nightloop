const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true if the value matches the standard UUID v4 format.
 *
 * Use this to guard DB paths that require a real UUID venue_id (real Postgres).
 * In-memory / mock mode accepts any non-empty string (e.g. "venue-audio") and
 * does not need this check.
 */
export function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
