import { Pool, type QueryResult as PgQueryResult, type QueryResultRow } from "pg";

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export interface DBClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  close?(): Promise<void>;
}

class PgDBClient implements DBClient {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query<T = unknown>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result: PgQueryResult<QueryResultRow> = await this.pool.query(text, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? 0
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class UnconfiguredDBClient implements DBClient {
  async query<T = unknown>(_text: string, _params: unknown[] = []): Promise<QueryResult<T>> {
    throw new Error(
      "DB client not configured. Set DATABASE_URL or wire a custom client with setDBClient()."
    );
  }
}

let client: DBClient = process.env.DATABASE_URL
  ? new PgDBClient(process.env.DATABASE_URL)
  : new UnconfiguredDBClient();

export function setDBClient(nextClient: DBClient): void {
  client = nextClient;
}

export function getDBClient(): DBClient {
  return client;
}

export async function dbQuery<T = unknown>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  return client.query<T>(text, params);
}
