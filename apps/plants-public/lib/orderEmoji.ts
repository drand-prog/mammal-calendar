// One emoji pool per group (keyed by the `formal` field in
// data/plants/orders.json, which for this app is identical to `name` --
// see scripts/wcvp_group_mapping_diagnostic.py for the GROUPS list), used
// for a month card's badge once at least one group has been assigned to
// that month -- see pickMonthEmoji in appScript.js, which pools together
// the options for every group sharing a month and picks one at random per
// load.
//
// Unlike reptiles/amphibians (turtle, snake, lizard...), most of these
// picks ARE literal matches to a real, taxonomically significant member of
// that group -- Rosales really does contain the rose, Poales really does
// contain wheat/rice/rye. Two exceptions, noted per entry: no orchid emoji
// exists in Unicode at all, so Orchids gets a generic flower as a stand-in;
// and Malvids' maple-leaf pick highlights one recognizable member (Acer,
// via Sapindales) rather than the group's biggest families.
export const ORDER_EMOJI: Record<string, string[]> = {
  // Asterales (daisies, sunflowers) dominates this group by genus count.
  Campanulids: ["🌻"],
  // Lamiaceae (the mint family) anchors this order.
  Lamiales: ["🌿"],
  // Coffea (coffee) is in Rubiaceae, under order Gentianales here.
  "All other Lamiids": ["☕"],
  // Caryophyllales (cacti, carnations, beets) is the standout member.
  "All other Superasterids": ["🌵"],
  // Acer (maples) -- via Sapindales -- one recognizable member of a
  // group that also includes citrus, cacao, and cotton.
  Malvids: ["🍁"],
  Fabales: ["🫘"],
  Rosales: ["🌹"],
  // Fagales (oaks, beeches, chestnuts) is a notable chunk of this
  // catch-all, alongside cucumbers/melons and willows/violets.
  "All other Fabids + earlier-branching Eudicots": ["🌰"],
  // Grasses and grains -- wheat, rice, corn, bamboo -- are almost all of
  // this order.
  Poales: ["🌾"],
  // No orchid emoji exists in Unicode -- generic flower as a stand-in,
  // not a taxonomic hint.
  Orchids: ["🌸"],
  // Arecales (palms) is one recognizable member of a group that also
  // includes lilies, tulips, bananas, and alliums.
  "All other Monocots": ["🌴"],
  // Persea (avocado) is in Lauraceae, under order Laurales -- a
  // genuine magnoliid.
  "Magnoliids + ANA": ["🥑"],
};

export const ALL_ORDER_EMOJI: string[] = Array.from(
  new Set(Object.values(ORDER_EMOJI).flat())
);
