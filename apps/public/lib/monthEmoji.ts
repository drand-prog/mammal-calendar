// One list per calendar month (Jan..Dec) of emoji that plausibly fit that
// month's clade. Shared between appScript.js (each month card's badge, one
// picked per month) and icon.tsx (the rotating favicon, drawn from all of
// them pooled together).
export const MONTH_EMOJI: string[][] = [
  ["🐵","🐒","🦍","🦧"],                                            // January -- Primates
  ["🐭","🐁","🐀","🐹","🐿️","🦫"],                                  // February -- Rodentia
  ["🐰","🐇"],                                                      // March -- Lagomorpha
  ["🥚"],                                                           // April -- Monotremata
  ["🦘","🐨"],                                                      // May -- Marsupialia
  ["🌈"],                                                           // June -- Afroinsectiphilia
  ["🐘","🦣"],                                                      // July -- Paenungulata
  ["🐺","🦊","🦁","🐯","🐻","🐼","🦭","🦡"],                          // August -- Carnivora
  ["🦥"],                                                           // September -- Xenarthra
  ["🦔"],                                                           // October -- Eulipotyphla
  ["🦇"],                                                           // November -- Chiroptera
  ["🦓","🦌","🦬","🐄","🐖","🐐","🐫","🦙","🦒","🦏","🦛","🐋","🐬"]   // December -- Ungulata
];
