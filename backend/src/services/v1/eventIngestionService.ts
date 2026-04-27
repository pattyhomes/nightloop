export type FetchedEvent = {
  source_event_id?: string | null;
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  url?: string | null;
  source_url: string;
  cover_amount_dollars?: number | null;
};

export type SanitizedFetchedEvent = {
  source_event_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  url: string | null;
  metadata: {
    source_url: string;
    cover_amount_dollars?: number;
  };
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function textBetween(input: string, tag: string): string | null {
  const match = input.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(stripCdata(match[1]?.trim() ?? "")) : null;
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const trimmed = value.trim();
  const ics = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z?$/);
  const parsed = ics
    ? new Date(Date.UTC(
        Number(ics[1]),
        Number(ics[2]) - 1,
        Number(ics[3]),
        Number(ics[4]),
        Number(ics[5]),
        Number(ics[6] ?? 0)
      ))
    : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function unfoldIcs(input: string): string[] {
  return input
    .replace(/\r\n[ \t]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function icsValue(lines: string[], key: string): string | null {
  const line = lines.find((entry) => entry.toUpperCase().startsWith(`${key}:`) || entry.toUpperCase().startsWith(`${key};`));
  if (!line) return null;
  return line.slice(line.indexOf(":") + 1).trim();
}

export function parseIcsEvents(input: string, sourceUrl: string): FetchedEvent[] {
  const blocks = input.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  return blocks.map((block) => {
    const lines = unfoldIcs(block);
    return {
      source_event_id: icsValue(lines, "UID"),
      title: icsValue(lines, "SUMMARY"),
      starts_at: parseDate(icsValue(lines, "DTSTART")),
      ends_at: parseDate(icsValue(lines, "DTEND")),
      url: icsValue(lines, "URL"),
      source_url: sourceUrl
    };
  });
}

function eventItemsFromJson(input: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(input)) return input.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    for (const key of ["events", "items", "data"]) {
      if (Array.isArray(record[key])) {
        return (record[key] as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
      }
    }
  }
  return [];
}

export function parseJsonFeedEvents(input: unknown, sourceUrl: string): FetchedEvent[] {
  return eventItemsFromJson(input).map((event) => ({
    source_event_id: stringField(event, "id", "uid", "guid"),
    title: stringField(event, "title", "name", "summary"),
    starts_at: parseDate(stringField(event, "start", "starts_at", "startDate", "start_time")),
    ends_at: parseDate(stringField(event, "end", "ends_at", "endDate", "end_time")),
    url: stringField(event, "url", "link"),
    source_url: sourceUrl,
    cover_amount_dollars: numberField(event, "cover_amount_dollars", "price")
  }));
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const parsed = Number(record[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const graph = record["@graph"];
  return [record, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

export function parseJsonLdEvents(html: string, sourceUrl: string): FetchedEvent[] {
  const scriptMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const events: FetchedEvent[] = [];
  for (const script of scriptMatches) {
    const body = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(body);
      for (const item of flattenJsonLd(parsed)) {
        const type = item["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (!types.includes("Event")) continue;
        const offers = item.offers && typeof item.offers === "object" ? item.offers as Record<string, unknown> : {};
        events.push({
          source_event_id: stringField(item, "@id", "identifier"),
          title: stringField(item, "name", "title"),
          starts_at: parseDate(stringField(item, "startDate", "starts_at")),
          ends_at: parseDate(stringField(item, "endDate", "ends_at")),
          url: stringField(item, "url"),
          source_url: sourceUrl,
          cover_amount_dollars: numberField(offers, "price")
        });
      }
    } catch {
      continue;
    }
  }
  return events;
}

export function parseRssEvents(input: string, sourceUrl: string): FetchedEvent[] {
  const blocks = input.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return blocks.map((block) => ({
    source_event_id: textBetween(block, "guid") ?? textBetween(block, "id"),
    title: textBetween(block, "title"),
    starts_at: parseDate(textBetween(block, "startDate") ?? textBetween(block, "starts_at") ?? textBetween(block, "pubDate")),
    ends_at: parseDate(textBetween(block, "endDate") ?? textBetween(block, "ends_at")),
    url: textBetween(block, "link"),
    source_url: sourceUrl
  }));
}

export function sanitizeFetchedEvent(event: FetchedEvent | undefined): SanitizedFetchedEvent {
  if (!event?.title || !event.starts_at) {
    throw new Error("Fetched event is missing title or start time.");
  }
  const metadata: SanitizedFetchedEvent["metadata"] = {
    source_url: event.source_url
  };
  if (typeof event.cover_amount_dollars === "number" && Number.isFinite(event.cover_amount_dollars)) {
    metadata.cover_amount_dollars = event.cover_amount_dollars;
  }
  return {
    source_event_id: event.source_event_id ?? null,
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at ?? null,
    url: event.url ?? null,
    metadata
  };
}

export function robotsAllowsPath(robotsText: string, pathname: string, userAgent = "*"): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ type: "allow" | "disallow"; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ type: "allow" | "disallow"; path: string }> } | null = null;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      current = { agents: [value.toLowerCase()], rules: [] };
      groups.push(current);
      continue;
    }
    if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ type: key, path: value });
    }
  }

  const applicable = groups.filter((group) => group.agents.includes("*") || group.agents.includes(userAgent.toLowerCase()));
  const matchingRules = applicable
    .flatMap((group) => group.rules)
    .filter((rule) => rule.path.length > 0 && pathname.startsWith(rule.path))
    .sort((left, right) => right.path.length - left.path.length);
  const rule = matchingRules[0];
  return !rule || rule.type === "allow";
}
