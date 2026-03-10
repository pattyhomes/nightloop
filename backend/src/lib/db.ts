/**
 * Nightloop DB starter module.
 *
 * This is intentionally minimal until a DB client dependency is selected
 * (e.g. `pg`, `postgres`, Prisma, Drizzle).
 */

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export interface DBClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  close?(): Promise<void>;
}

class UnconfiguredDBClient implements DBClient {
  async query<T = unknown>(_text: string, _params: unknown[] = []): Promise<QueryResult<T>> {
    throw new Error('DB client not configured. Wire a postgres client in backend/src/lib/db.ts');
  }
}

let client: DBClient = new UnconfiguredDBClient();

export function setDBClient(nextClient: DBClient): void {
  client = nextClient;
}

export function getDBClient(): DBClient {
  return client;
}

export async function dbQuery<T = unknown>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  return client.query<T>(text, params);
}
