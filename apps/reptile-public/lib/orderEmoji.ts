// One emoji pool per group (keyed by the `formal` field in
// data/reptile/orders.json), used for a month card's badge once at least one
// group has been assigned to that month -- see pickMonthEmoji in
// appScript.js, which pools together the options for every group sharing a
// month and picks one at random per load. Unlike the bird app's 46 orders,
// reptiles/amphibians split into a fixed 12 groups (see GROUPS in
// scripts/fetch_reptile_amphibian_data.py), so every one of them gets an
// entry here.
//
// Unicode's reptile/amphibian glyph vocabulary is much thinner than birds':
// essentially just turtle, crocodile, snake, lizard, and frog. Where a group
// doesn't map to one of those literally, the pick below is a deliberate
// aesthetic/thematic association instead (noted per entry) rather than a
// generic filler -- a group with no fitting glyph at all gets an empty pool
// and contributes nothing to a shared month's badge.
// ALL_ORDER_EMOJI (all pools, flattened and deduped) drives the rotating
// favicon in app/api/favicon/route.tsx, independent of any assignment.
export const ORDER_EMOJI: Record<string, string[]> = {
  Testudines: ["🐢"],
  Crocodylia: ["🐊"],
  "Serpentes (Squamata families)": ["🐍"],
  "Dibamia + Gekkota + Scincoidea (Squamata families)": ["🦎"],
  // Monitor lizards (Varanidae) include the Komodo dragon -- a literal, not
  // arbitrary, connection.
  "Lacertoidea + Anguimorpha (Squamata families)": ["🐉"],
  // No iguana-specific glyph exists -- palm tree is an aesthetic nod to
  // iguanas' typical tropical/desert range, not a taxonomic hint.
  "Iguania minus Chamaeleonidae (Squamata families)": ["🌴"],
  // No chameleon glyph exists either -- palette is an aesthetic nod to their
  // famous color-changing, not a taxonomic hint.
  Chamaeleonidae: ["🎨"],
  "Ranoidea (Anura families)": ["🐸"],
  "Hyloidea (Anura families)": ["🐸"],
  "Anura (all other families)": ["🐸"],
  // No salamander/newt glyph exists -- fire is the classic folklore
  // association (salamanders were long believed to live in, or be born
  // from, flame), an aesthetic nod rather than a taxonomic hint.
  Caudata: ["🔥"],
  // No caecilian glyph exists -- worm is a visual match (caecilians are
  // legless, burrowing amphibians frequently described as worm- or eel-
  // like), not a taxonomic hint.
  Gymnophiona: ["🪱"],
};

export const ALL_ORDER_EMOJI: string[] = Array.from(
  new Set(Object.values(ORDER_EMOJI).flat())
);
