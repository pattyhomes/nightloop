export type FetchedEvent = {
  source_event_id?: string | null;
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  url?: string | null;
  source_url: string;
  cover_amount_dollars?: number | null;
  time_precision?: "exact" | "date_only_default_22";
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
    time_precision?: "exact" | "date_only_default_22";
  };
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é")
    .replace(/&ldquo;/g, "\"")
    .replace(/&rdquo;/g, "\"")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function textBetween(input: string, tag: string): string | null {
  const match = input.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(stripCdata(match[1]?.trim() ?? "")) : null;
}

function stripHtml(value: string): string {
  return decodeEntities(stripCdata(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
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

function parseMonthDay(value: string): { month: number; day: number } | null {
  const match = value.trim().match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function parseVenueTime(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return { hour, minute };
}

function dateTimeIsoPacific(month: number, day: number, hour: number, minute: number): string {
  const now = new Date();
  let year = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (month < currentMonth - 1) year += 1;
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-07:00`).toISOString();
}

function dateTimeIsoPacificForYear(year: number, month: number, day: number, hour: number, minute: number): string {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-07:00`).toISOString();
}

const monthNames: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function parseNamedMonthDay(value: string): { month: number; day: number } | null {
  const match = value.match(/\b(?:mon|tue|wed|thu|fri|sat|sun)?\.?,?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (!match) return null;
  const month = monthNames[match[1]?.toLowerCase() ?? ""];
  const day = Number(match[2]);
  if (!month || day < 1 || day > 31) return null;
  return { month, day };
}

function eventDateOnly(month: number, day: number): { starts_at: string; time_precision: "date_only_default_22" } {
  return {
    starts_at: dateTimeIsoPacific(month, day, 22, 0),
    time_precision: "date_only_default_22"
  };
}

function hrefs(input: string): string[] {
  return [...input.matchAll(/href=["']([^"']+)["']/gi)].map((match) => decodeEntities(match[1] ?? ""));
}

export function parseTicketwebPluginEvents(html: string, sourceUrl: string): FetchedEvent[] {
  const blocks = html.match(/<div class=["'][^"']*date-img-wrapper[^"']*["'][\s\S]*?(?=<div class=["'][^"']*date-img-wrapper|<\/body>|$)/gi) ?? [];
  const events: FetchedEvent[] = [];
  for (const block of blocks) {
    const dateText = textBetween(block, "span")?.match(/^\d{1,2}\.\d{1,2}$/)
      ? textBetween(block, "span")
      : (block.match(/<span class=["'][^"']*tw-event-date[^"']*["'][^>]*>([^<]+)<\/span>/i)?.[1] ?? null);
    const date = dateText ? parseMonthDay(decodeEntities(dateText)) : null;
    const timeText = block.match(/<span class=["'][^"']*tw-event-time[^"']*["'][^>]*>([^<]+)<\/span>/i)?.[1] ?? "";
    const time = parseVenueTime(decodeEntities(timeText));
    const eventUrl = block.match(/href=["']([^"']*\/tm-event\/[^"']+)["']/i)?.[1] ?? null;
    const resolvedUrl = eventUrl ? new URL(decodeEntities(eventUrl), sourceUrl).toString() : null;
    const titleAttr = block.match(/(?:aria-label|title)=["']Event Name - ([^"']+?)(?: \| Event Date|["'])/i)?.[1] ?? null;
    const title = titleAttr ? decodeEntities(titleAttr).replace(/\s+/g, " ").trim() : null;
    if (!date || !time || !title) continue;
    events.push({
      source_event_id: resolvedUrl ?? `${sourceUrl}#${date.month}-${date.day}-${title}`,
      title,
      starts_at: dateTimeIsoPacific(date.month, date.day, time.hour, time.minute),
      ends_at: null,
      url: resolvedUrl,
      source_url: sourceUrl
    });
  }
  return events;
}

function parseAudioSfEventDetail(html: string, sourceUrl: string): FetchedEvent[] {
  if (!/audiosf\.com\/event\//i.test(sourceUrl) && !/id=["']event-container/i.test(html)) return [];
  const dateText = stripHtml(html.match(/<div[^>]+id=["']event-container-date["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "")
    || stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const date = parseNamedMonthDay(dateText);
  const title = stripHtml(html.match(/<div[^>]+id=["']event-container-title["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "")
    || stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").split(" - ")[0] ?? "");
  if (!date || !title) return [];
  const ticketUrl = html.match(/<form[^>]+action=["'](https:\/\/(?:wl\.)?eventim\.us\/event\/[^"']+)["']/i)?.[1] ?? null;
  const startsAt = eventDateOnly(date.month, date.day);
  return [{
    source_event_id: sourceUrl,
    title,
    starts_at: startsAt.starts_at,
    ends_at: null,
    url: ticketUrl ? decodeEntities(ticketUrl) : sourceUrl,
    source_url: sourceUrl,
    time_precision: startsAt.time_precision
  }];
}

function parse1015Events(html: string, sourceUrl: string): FetchedEvent[] {
  if (!/1015\.com/i.test(sourceUrl) && !/1015Folsom/i.test(html)) return [];
  const blocks = html.match(/<a[^>]+href=["']https:\/\/wl\.eventim\.us\/event\/[^"']+["'][\s\S]*?(?=<a[^>]+href=["']https:\/\/wl\.eventim\.us\/event\/|<\/body>|$)/gi) ?? [];
  const events: FetchedEvent[] = [];
  for (const block of blocks) {
    const ticketUrl = block.match(/href=["'](https:\/\/wl\.eventim\.us\/event\/[^"']+)["']/i)?.[1] ?? null;
    const dateText = stripHtml(block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] ?? "");
    const title = stripHtml(block.match(/<h3[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/h3>/i)?.[1] ?? "");
    const date = parseNamedMonthDay(dateText);
    if (!ticketUrl || !date || !title) continue;
    const startsAt = eventDateOnly(date.month, date.day);
    events.push({
      source_event_id: ticketUrl,
      title,
      starts_at: startsAt.starts_at,
      ends_at: null,
      url: decodeEntities(ticketUrl),
      source_url: sourceUrl,
      time_precision: startsAt.time_precision
    });
  }
  return events;
}

function parseBoomBoomRoomEvents(html: string, sourceUrl: string): FetchedEvent[] {
  if (!/boomboomroom\.com/i.test(sourceUrl) && !/rhp-events-list-widget-events/i.test(html)) return [];
  const blocks = html.match(/<div[^>]+class=["'][^"']*rhp-events-list-widget-events[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*rhp-events-list-widget-events|<\/body>|$)/gi) ?? [];
  const events: FetchedEvent[] = [];
  for (const block of blocks) {
    const dateText = stripHtml(block.match(/<div[^>]+class=["'][^"']*eventDate[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
    const titleAnchor = block.match(/<h4[^>]+class=["'][^"']*entry-title[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const eventUrl = titleAnchor?.[1] ? new URL(decodeEntities(titleAnchor[1]), sourceUrl).toString() : null;
    const title = titleAnchor?.[2] ? stripHtml(titleAnchor[2]) : null;
    const date = parseNamedMonthDay(dateText);
    if (!eventUrl || !title || !date) continue;
    const startsAt = eventDateOnly(date.month, date.day);
    events.push({
      source_event_id: eventUrl,
      title,
      starts_at: startsAt.starts_at,
      ends_at: null,
      url: eventUrl,
      source_url: sourceUrl,
      time_precision: startsAt.time_precision
    });
  }
  return events;
}

export function parseVenueOwnedHtmlEvents(html: string, sourceUrl: string): FetchedEvent[] {
  return [
    ...parseTicketwebPluginEvents(html, sourceUrl),
    ...parseAudioSfEventDetail(html, sourceUrl),
    ...parse1015Events(html, sourceUrl),
    ...parseBoomBoomRoomEvents(html, sourceUrl)
  ];
}

function parseBottomOfTheHillRssItem(block: string, sourceUrl: string): FetchedEvent | null {
  if (!/bottomofthehill/i.test(sourceUrl)) return null;
  const rawTitle = textBetween(block, "title");
  const match = rawTitle?.match(/^(\d{4})\s+(\d{1,2})\/(\d{1,2})\s*:\s*(.+)$/);
  if (!match) return null;
  const description = textBetween(block, "description") ?? "";
  const parsedTime = parseVenueTime(stripHtml(description));
  const time = parsedTime ?? { hour: 22, minute: 0 };
  return {
    source_event_id: textBetween(block, "guid") ?? textBetween(block, "id"),
    title: match[4]?.trim() ?? rawTitle,
    starts_at: dateTimeIsoPacificForYear(Number(match[1]), Number(match[2]), Number(match[3]), time.hour, time.minute),
    ends_at: null,
    url: textBetween(block, "link"),
    source_url: sourceUrl,
    time_precision: parsedTime ? "exact" : "date_only_default_22"
  };
}

export function parseRssEvents(input: string, sourceUrl: string): FetchedEvent[] {
  const blocks = input.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return blocks.map((block) => parseBottomOfTheHillRssItem(block, sourceUrl) ?? {
    source_event_id: textBetween(block, "guid") ?? textBetween(block, "id"),
    title: textBetween(block, "title"),
    starts_at: parseDate(textBetween(block, "startDate") ?? textBetween(block, "starts_at") ?? textBetween(block, "pubDate")),
    ends_at: parseDate(textBetween(block, "endDate") ?? textBetween(block, "ends_at")),
    url: textBetween(block, "link"),
    source_url: sourceUrl
  });
}

export function parseVenueOwnedEventDetailLinks(html: string, sourceUrl: string, limit = 25): string[] {
  const base = new URL(sourceUrl);
  const seen = new Set<string>();
  for (const href of hrefs(html)) {
    try {
      const url = new URL(href, sourceUrl);
      if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
      if (!/^\/(?:event|tm-event)\//i.test(url.pathname)) continue;
      url.hash = "";
      seen.add(url.toString());
    } catch {
      continue;
    }
  }
  return [...seen].slice(0, Math.max(1, limit));
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
  if (event.time_precision) {
    metadata.time_precision = event.time_precision;
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
