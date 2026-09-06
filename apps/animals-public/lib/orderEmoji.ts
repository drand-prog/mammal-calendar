// One emoji pool per group (keyed by the `formal` field in
// data/animals/orders.json, which for this app is identical to `name` --
// see PHYLUM_TO_GROUP in scripts/build_animal_families_from_backbone.py for
// the GROUPS list), used for a month card's badge once at least one group
// has been assigned to that month -- see pickEmoji in appScript.js, which
// pools together the options for every group sharing a month and picks one
// at random per load. A group with no fitting glyph at all gets an empty
// pool and contributes nothing to a shared month's badge -- no generic
// filler, and for now, no aesthetic/nickname stand-ins either (tardigrades'
// "water bear" nickname and a star for Echinodermata's body plan were both
// tried and pulled back out). The one exception is Annelida, which keeps
// Unicode's only worm glyph (🪱) even though it's a generic "worm," not an
// annelid-specific one -- Cycloneuralia and Platyhelminthes (also
// colloquially "worms") stay empty rather than share it.
// ALL_ORDER_EMOJI (all pools, flattened and deduped) drives the rotating
// favicon in app/api/favicon/route.tsx, independent of any assignment.
export const ORDER_EMOJI: Record<string, string[]> = {
  // Sponges (Porifera) are the dominant phylum here by family count -- no
  // comb jelly or placozoan glyph exists.
  "Porifera + Ctenophora + Placozoa": ["🧽"],
  // Jellyfish and coral are both literal, common Cnidaria.
  Cnidaria: ["🪼", "🪸"],
  // The full set of Unicode's insect glyphs -- every one of these is a
  // literal insect, not a stand-in.
  Insecta: ["🐝", "🦋", "🐛", "🐜", "🪲", "🐞", "🦗", "🪳", "🦟", "🪰"],
  Crustacea: ["🦀", "🦞", "🦐"],
  // Arachnids (spiders, scorpions) are the most recognizable members of this
  // catch-all -- centipedes, millipedes, horseshoe crabs, and sea spiders
  // have no dedicated glyph. Spider web is the structure, not the animal,
  // but it's unambiguously arachnid.
  "All other Arthropoda": ["🕷️", "🦂", "🕸️"],
  // No tardigrade or velvet-worm glyph exists -- empty pool for now.
  "Tardigrada + Onychophora": [],
  // No roundworm-specific glyph exists -- empty pool for now.
  Cycloneuralia: [],
  Mollusca: ["🐌", "🐚", "🦑", "🐙"],
  Annelida: ["🪱"],
  // No flatworm-specific glyph exists -- empty pool for now.
  Platyhelminthes: [],
  // No starfish/sea-urchin glyph exists -- empty pool for now.
  "Xenacoelomorpha + Echinodermata + Hemichordata": [],
  // Nemertea, gastrotrichs, entoprocts, cycliophorans, chaetognaths,
  // brachiopods, bryozoans, phoronids, gnathostomulids, micrognathozoans,
  // and rotifers -- none has a fitting glyph, so this catch-all gets none.
  "All other Spiralia": [],
};

export const ALL_ORDER_EMOJI: string[] = Array.from(
  new Set(Object.values(ORDER_EMOJI).flat())
);
