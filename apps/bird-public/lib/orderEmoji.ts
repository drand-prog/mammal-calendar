// One emoji pool per bird order (keyed by formal/scientific name), used for
// a month card's badge once at least one order has been assigned to that
// month -- see pickMonthEmoji in appScript.js, which pools together the
// options for every order sharing a month and picks one at random per load.
// Orders with no obviously fitting glyph fall back to a plain bird.
// ALL_ORDER_EMOJI (all pools, flattened and deduped) drives the rotating
// favicon in app/api/favicon/route.tsx, independent of any assignment.
export const ORDER_EMOJI: Record<string, string[]> = {
  "Passeriformes (Tyranni)": ["🐦", "🐦‍⬛", "🪶"],
  "Passeriformes (basal Australasian)": ["🐦", "🐦‍⬛", "🪶"],
  "Passeriformes (Corvides)": ["🐦", "🐦‍⬛", "🪶"],
  "Passeriformes (Muscicapida)": ["🐦", "🐦‍⬛", "🪶"],
  "Passeriformes (Sylviida)": ["🐦", "🐦‍⬛", "🪶"],
  "Passeriformes (Passerida)": ["🐦", "🐦‍⬛", "🪶"],
  Apodiformes: ["🐦"],
  Psittaciformes: ["🦜"],
  Piciformes: ["🐦"],
  Charadriiformes: ["🐦"],
  Columbiformes: ["🕊️", "🦤"],
  Galliformes: ["🐓", "🐔", "🦃", "🦚"],
  Accipitriformes: ["🦅"],
  Strigiformes: ["🐦"],
  Coraciiformes: ["🐦"],
  Anseriformes: ["🦆", "🦢", "🪿"],
  Gruiformes: ["🐦"],
  Cuculiformes: ["🐦"],
  Procellariiformes: ["🐦"],
  Pelecaniformes: ["🐦"],
  Caprimulgiformes: ["🐦"],
  Bucerotiformes: ["🐦"],
  Falconiformes: ["🦅"],
  Galbuliformes: ["🐦"],
  Suliformes: ["🐦"],
  Trogoniformes: ["🐦"],
  Tinamiformes: ["🐦"],
  Otidiformes: ["🐦"],
  Musophagiformes: ["🐦"],
  Ciconiiformes: ["🐦"],
  Podicipediformes: ["🐦"],
  Sphenisciformes: ["🐧"],
  Pterocliformes: ["🐦"],
  Podargiformes: ["🐦"],
  Aegotheliformes: ["🐦"],
  Nyctibiiformes: ["🐦"],
  Phoenicopteriformes: ["🦩"],
  Cathartiformes: ["🐦"],
  Coliiformes: ["🐦"],
  Apterygiformes: ["🥝"],
  Gaviiformes: ["🐦"],
  Casuariiformes: ["🐦"],
  Mesitornithiformes: ["🐦"],
  Phaethontiformes: ["🐦"],
  Struthioniformes: ["🐦"],
  Rheiformes: ["🐦"],
  Eurypygiformes: ["🐦"],
  Cariamiformes: ["🐦"],
  Opisthocomiformes: ["🐦"],
  Steatornithiformes: ["🐦"],
  Leptosomiformes: ["🐦"],
};

export const ALL_ORDER_EMOJI: string[] = Array.from(
  new Set(Object.values(ORDER_EMOJI).flat())
);
