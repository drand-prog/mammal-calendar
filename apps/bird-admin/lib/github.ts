// Same repo as the mammal admin's lib/github.ts -- the bird apps are a
// second product living in data/bird/ and apps/bird-*/ of the same
// mammal-calendar repo, not a separate one.
const OWNER = process.env.GITHUB_REPO_OWNER || "drand-prog";
const REPO = process.env.GITHUB_REPO_NAME || "mammal-calendar";
const BRANCH = process.env.GITHUB_REPO_BRANCH || "main";

export type Faq = { q: string; a: string };
export type OrderEntry = { name: string; formal: string; count: number; month: number | null };

/**
 * Commits a new version of a data/*.json file to the repo via the GitHub
 * REST API. This is the "save" for the admin panel: Vercel's GitHub
 * integration picks up the push and redeploys BOTH the public and admin
 * projects automatically, so a save takes roughly as long as a normal
 * deploy to go live -- not instant.
 */
export async function commitJsonFile(
  relativePath: string,
  data: unknown,
  commitMessage: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, error: "GITHUB_TOKEN is not configured on the server." };
  }

  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${relativePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Need the current file's blob SHA to update it.
  const getRes = await fetch(`${apiBase}?ref=${BRANCH}`, { headers, cache: "no-store" });
  if (!getRes.ok) {
    return { ok: false, error: `Couldn't read the current file from GitHub (${getRes.status}).` };
  }
  const current = (await getRes.json()) as { sha: string };

  const content = JSON.stringify(data, null, 2) + "\n";
  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, "utf-8").toString("base64"),
      sha: current.sha,
      branch: BRANCH,
    }),
  });

  if (!putRes.ok) {
    const body = await putRes.text().catch(() => "");
    return { ok: false, error: `GitHub rejected the commit (${putRes.status}). ${body.slice(0, 200)}` };
  }

  return { ok: true };
}

export async function commitFaqs(faqs: Faq[]) {
  return commitJsonFile(
    "data/bird/faqs.json",
    faqs,
    `Update bird FAQs (${faqs.length} question${faqs.length === 1 ? "" : "s"}) via admin panel`
  );
}

export async function commitOrders(orders: OrderEntry[]) {
  const assigned = orders.filter((o) => o.month != null).length;
  return commitJsonFile(
    "data/bird/orders.json",
    orders,
    `Update bird order→month assignments (${assigned}/${orders.length} orders assigned) via admin panel`
  );
}
