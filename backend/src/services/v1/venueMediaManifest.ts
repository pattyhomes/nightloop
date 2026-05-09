export type VenueMediaManifestEntry = {
  canonicalName: string;
  aliases: string[];
  websiteUrl: string;
  proofUrl: string;
  verifiedAt: string;
};

export const CORE10_MEDIA_SOURCES: readonly VenueMediaManifestEntry[] = [
  {
    canonicalName: "1015 Folsom",
    aliases: ["1015 Folsom", "1015"],
    websiteUrl: "https://1015.com/",
    proofUrl: "https://1015.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Audio SF",
    aliases: ["Audio SF", "Audio"],
    websiteUrl: "https://audiosf.com/",
    proofUrl: "https://audiosf.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Novela",
    aliases: ["Novela"],
    websiteUrl: "https://www.novelasf.com/",
    proofUrl: "https://www.novelasf.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Black Cat",
    aliases: ["Black Cat"],
    websiteUrl: "https://blackcatsf.com/",
    proofUrl: "https://blackcatsf.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Bottom of the Hill",
    aliases: ["Bottom of the Hill"],
    websiteUrl: "https://www.bottomofthehill.com/",
    proofUrl: "https://www.bottomofthehill.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Lone Star Saloon",
    aliases: ["Lone Star Saloon", "The Lone Star Saloon"],
    websiteUrl: "https://www.lonestarsf.com/",
    proofUrl: "https://www.lonestarsf.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Monarch SF",
    aliases: ["Monarch SF", "Monarch"],
    websiteUrl: "https://monarchsf.com/",
    proofUrl: "https://monarchsf.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Public Works",
    aliases: ["Public Works", "Public Works SF"],
    websiteUrl: "https://publicsf.com/",
    proofUrl: "https://publicsf.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Cafe Du Nord",
    aliases: ["Cafe Du Nord", "Cafe du Nord"],
    websiteUrl: "https://cafedunord.com/",
    proofUrl: "https://cafedunord.com/",
    verifiedAt: "2026-05-03"
  },
  {
    canonicalName: "Make-Out Room",
    aliases: ["Make-Out Room", "The Make-Out Room", "Makeout Room"],
    websiteUrl: "https://www.makeoutroom.com/",
    proofUrl: "https://www.makeoutroom.com/",
    verifiedAt: "2026-05-03"
  }
];

