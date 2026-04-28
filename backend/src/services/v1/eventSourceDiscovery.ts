export type DiscoveredEventSourceType =
  | "eventbrite_venue"
  | "eventbrite_organizer"
  | "venue_ical"
  | "venue_json"
  | "venue_rss"
  | "venue_json_ld";

export type DiscoveredEventSource = {
  source_type: DiscoveredEventSourceType;
  source_url: string | null;
  provider_id: string | null;
  label: string | null;
  score: number;
};

export type DiscoveryRejectionReason =
  | "external_non_provider"
  | "invalid_url"
  | "not_event_source"
  | "one_off_event_detail_page"
  | "static_or_excluded";

export type RejectedEventSourceCandidate = {
  href: string;
  source_url: string | null;
  label: string | null;
  reason: DiscoveryRejectionReason;
};

export type EventSourceDiscoveryReport = {
  durable_sources: DiscoveredEventSource[];
  detail_page_candidates: RejectedEventSourceCandidate[];
  rejected_candidates: RejectedEventSourceCandidate[];
  errored_candidates: RejectedEventSourceCandidate[];
};

type LinkCandidate = {
  href: string;
  label: string;
};

const eventIntentPattern = /\b(events?|calendar|shows?|schedule|lineup|listings?|tickets?)\b/i;
const excludedPathPattern = /\b(private|privacy|terms|contact|careers|jobs|press|gallery|photos?|menu|food|drink|merch|shop|gift|comments?|assets?|wp-content|plugins?|themes?|css|js|fonts?)\b/i;
const excludedLabelPattern = /\b(private events?|book an event|venue rental|rental|host an event)\b/i;
const staticAssetPattern = /\.(?:css|js|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|pdf)(?:$|\?)/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeHost(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function normalizeUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(decodeEntities(value.trim()), baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function rejection(link: LinkCandidate, sourceUrl: string | null, reason: DiscoveryRejectionReason): RejectedEventSourceCandidate {
  return {
    href: link.href,
    source_url: sourceUrl,
    label: link.label || null,
    reason
  };
}

function linkCandidates(html: string): LinkCandidate[] {
  const candidates: LinkCandidate[] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    candidates.push({
      href: match[1] ?? "",
      label: stripTags(match[2] ?? "")
    });
  }

  const linkPattern = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  while ((match = linkPattern.exec(html))) {
    const tag = match[0] ?? "";
    candidates.push({
      href: match[1] ?? "",
      label: stripTags(tag)
    });
  }
  return candidates;
}

function isStaticOrExcluded(candidateUrl: URL, label: string): boolean {
  return staticAssetPattern.test(`${candidateUrl.pathname}${candidateUrl.search}`)
    || excludedPathPattern.test(candidateUrl.pathname)
    || excludedLabelPattern.test(label);
}

function isOneOffEventDetailPage(candidateUrl: URL): boolean {
  const path = candidateUrl.pathname.replace(/\/+$/, "");
  if (/^\/tm-event\/[^/]+$/i.test(path)) return true;
  if (/^\/event\/[^/]+$/i.test(path)) return true;
  return false;
}

function eventbriteProvider(candidateUrl: URL): DiscoveredEventSource | null {
  if (!normalizeHost(candidateUrl.hostname).endsWith("eventbrite.com")) return null;
  const organizer = candidateUrl.pathname.match(/\/o\/[^/]*?(\d+)(?:\/)?$/i);
  if (organizer?.[1]) {
    return {
      source_type: "eventbrite_organizer",
      source_url: null,
      provider_id: organizer[1],
      label: "Eventbrite organizer",
      score: 0.95
    };
  }
  const venue = candidateUrl.pathname.match(/\/v\/[^/]*?(\d+)(?:\/)?$/i);
  if (venue?.[1]) {
    return {
      source_type: "eventbrite_venue",
      source_url: null,
      provider_id: venue[1],
      label: "Eventbrite venue",
      score: 0.95
    };
  }
  return null;
}

function venueSourceType(candidateUrl: URL, label: string): DiscoveredEventSourceType | null {
  const haystack = `${candidateUrl.pathname} ${candidateUrl.search} ${label}`;
  if (isStaticOrExcluded(candidateUrl, label)) return null;
  if (isOneOffEventDetailPage(candidateUrl)) return null;
  const isRootPath = candidateUrl.pathname === "/" || candidateUrl.pathname === "";
  if (/\.ics(?:$|\?)|^webcal:/i.test(`${candidateUrl.pathname}${candidateUrl.search}`)) return "venue_ical";
  if (/\.json(?:$|\?)|format=json|output=json/i.test(haystack) && eventIntentPattern.test(haystack)) return "venue_json";
  if (/rss|feed|\.xml(?:$|\?)/i.test(haystack) && eventIntentPattern.test(haystack)) return "venue_rss";
  if (isRootPath) return null;
  if (eventIntentPattern.test(haystack)) return "venue_json_ld";
  return null;
}

function scoreVenueSource(sourceType: DiscoveredEventSourceType, candidateUrl: URL, label: string): number {
  let score = 0.5;
  if (sourceType === "venue_ical" || sourceType === "venue_json" || sourceType === "venue_rss") score += 0.25;
  if (/events?/i.test(candidateUrl.pathname) || /events?/i.test(label)) score += 0.16;
  if (/calendar|shows?|schedule/i.test(candidateUrl.pathname) || /calendar|shows?|schedule/i.test(label)) score += 0.12;
  if (/tickets?/i.test(candidateUrl.pathname) || /tickets?/i.test(label)) score += 0.05;
  if (excludedPathPattern.test(candidateUrl.pathname)) score -= 0.35;
  return Math.max(0, Math.min(0.98, score));
}

function dedupeKey(source: DiscoveredEventSource): string {
  return `${source.source_type}:${source.provider_id ?? source.source_url}`;
}

export function analyzeEventSourcesFromHtml(html: string, baseUrl: string, maxPerVenue = 4): EventSourceDiscoveryReport {
  const base = new URL(baseUrl);
  const baseHost = normalizeHost(base.hostname);
  const discovered = new Map<string, DiscoveredEventSource>();
  const detailPageCandidates: RejectedEventSourceCandidate[] = [];
  const rejectedCandidates: RejectedEventSourceCandidate[] = [];
  const erroredCandidates: RejectedEventSourceCandidate[] = [];

  for (const link of linkCandidates(html)) {
    const normalized = normalizeUrl(link.href, baseUrl);
    if (!normalized) {
      erroredCandidates.push(rejection(link, null, "invalid_url"));
      continue;
    }
    const candidateUrl = new URL(normalized);
    const eventbrite = eventbriteProvider(candidateUrl);
    if (eventbrite) {
      discovered.set(dedupeKey(eventbrite), eventbrite);
      continue;
    }

    if (normalizeHost(candidateUrl.hostname) !== baseHost) {
      rejectedCandidates.push(rejection(link, candidateUrl.toString(), "external_non_provider"));
      continue;
    }
    if (isOneOffEventDetailPage(candidateUrl)) {
      detailPageCandidates.push(rejection(link, candidateUrl.toString(), "one_off_event_detail_page"));
      continue;
    }
    if (isStaticOrExcluded(candidateUrl, link.label)) {
      rejectedCandidates.push(rejection(link, candidateUrl.toString(), "static_or_excluded"));
      continue;
    }
    const sourceType = venueSourceType(candidateUrl, link.label);
    if (!sourceType) {
      rejectedCandidates.push(rejection(link, candidateUrl.toString(), "not_event_source"));
      continue;
    }
    const score = scoreVenueSource(sourceType, candidateUrl, link.label);
    if (score < 0.55) {
      rejectedCandidates.push(rejection(link, candidateUrl.toString(), "not_event_source"));
      continue;
    }
    const source = {
      source_type: sourceType,
      source_url: candidateUrl.toString(),
      provider_id: null,
      label: link.label || null,
      score
    };
    discovered.set(dedupeKey(source), source);
  }

  return {
    durable_sources: [...discovered.values()]
    .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, maxPerVenue)),
    detail_page_candidates: detailPageCandidates,
    rejected_candidates: rejectedCandidates,
    errored_candidates: erroredCandidates
  };
}

export function discoverEventSourcesFromHtml(html: string, baseUrl: string, maxPerVenue = 4): DiscoveredEventSource[] {
  return analyzeEventSourcesFromHtml(html, baseUrl, maxPerVenue).durable_sources;
}
