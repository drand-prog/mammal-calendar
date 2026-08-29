const OWNER = process.env.GITHUB_REPO_OWNER || "drand-prog";
const REPO = process.env.GITHUB_REPO_NAME || "mammal-calendar";
const BRANCH = process.env.GITHUB_REPO_BRANCH || "main";
const FAQS_PATH = "data/faqs.json";

export type Faq = { q: string; a: string };

/**
 * Commits a new data/faqs.json to the repo via the GitHub REST API. This is
 * the "save" for the admin panel: Vercel's GitHub integration picks up the
 * push and redeploys automatically, so a save takes roughly as long as a
 * normal deploy to go live — not instant like the artifact version.
 */
export async function commitFaqs(faqs: Faq[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, error: "GITHUB_TOKEN is not configured on the server." };
  }

  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FAQS_PATH}`;
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

  const content = JSON.stringify(faqs, null, 2) + "\n";
  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Update FAQs (${faqs.length} question${faqs.length === 1 ? "" : "s"}) via admin panel`,
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
