"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ContentFields = {
  title: string;
  searchLabel: string;
  searchPlaceholder: string;
  faqHeading: string;
  browsePrompt: string;
};

export type Faq = { q: string; a: string };
export type OrderEntry = { name: string; formal: string; count: number; month: number | null };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CONTENT_FIELDS: {
  key: keyof ContentFields;
  label: string;
  max: number;
  multiline?: boolean;
}[] = [
  { key: "title", label: "Title", max: 100 },
  { key: "searchLabel", label: "Search box label", max: 100 },
  { key: "searchPlaceholder", label: "Search box placeholder", max: 100 },
  { key: "faqHeading", label: "FAQ section heading", max: 100 },
  { key: "browsePrompt", label: "Browse-by-date prompt, shown before a month and day are picked", max: 200, multiline: true },
];

type Session = "checking" | "out" | "in";

export default function AdminEditor({
  initialContent,
  initialFaqs,
  initialOrders,
  initialMonthDescriptions,
}: {
  initialContent: ContentFields;
  initialFaqs: Faq[];
  initialOrders: OrderEntry[];
  initialMonthDescriptions: string[];
}) {
  const [session, setSession] = useState<Session>("checking");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((d) => setSession(d.loggedIn ? "in" : "out"))
      .catch(() => setSession("out"));
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSession("in");
        setPassword("");
      } else {
        setLoginError(data.error || "Incorrect passphrase.");
      }
    } catch {
      setLoginError("Couldn't reach the server. Try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setSession("out");
  }

  if (session === "checking") {
    return (
      <div className="wrap">
        <p className="lede">Checking your session…</p>
      </div>
    );
  }

  if (session === "out") {
    return (
      <div className="wrap">
        <div className="login-box">
          <span className="eyebrow">Bird Ephemeris</span>
          <h1>Admin</h1>
          <p className="lede" style={{ marginBottom: "1.5rem" }}>
            Enter the admin passphrase. It's checked server-side and never reaches this page's
            JavaScript beyond this one request.
          </p>
          <form onSubmit={login}>
            <input
              className="input"
              type="password"
              placeholder="Passphrase"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn" type="submit" disabled={loggingIn || !password}>
                {loggingIn ? "Checking…" : "Unlock"}
              </button>
            </div>
            {loginError && <p className="status err" style={{ marginTop: ".75rem" }}>{loginError}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="masthead">
        <span className="eyebrow">Bird Ephemeris</span>
        <h1>Admin</h1>
        <p className="lede">
          Changes here commit straight to GitHub and trigger a Vercel redeploy of the public
          site — live for everyone in about a minute, not instantly.
        </p>
      </header>

      <OrdersSection initialOrders={initialOrders} />
      <MonthDescriptionsSection initialMonthDescriptions={initialMonthDescriptions} />
      <ContentSection initialContent={initialContent} />
      <FaqSection initialFaqs={initialFaqs} />

      <button className="btn btn-secondary" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

function OrdersSection({ initialOrders }: { initialOrders: OrderEntry[] }) {
  const [months, setMonths] = useState<(number | null)[]>(() => initialOrders.map((o) => o.month));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind?: "ok" | "err" }>({ text: "" });

  function setMonth(i: number, value: string) {
    setMonths((list) => list.map((m, idx) => (idx === i ? (value === "" ? null : Number(value)) : m)));
  }

  const assignedOrders = months.filter((m) => m != null).length;
  const totalSpecies = initialOrders.reduce((sum, o) => sum + o.count, 0);
  const assignedSpecies = initialOrders.reduce((sum, o, i) => sum + (months[i] != null ? o.count : 0), 0);

  // Species assigned to each of the 12 months, recomputed as selects change
  // -- lets an admin see at a glance which months are still empty or
  // lopsided (Passeriformes alone is 61% of all species) before saving.
  const perMonth = useMemo(() => {
    const totals = new Array(12).fill(0) as number[];
    const orderCounts = new Array(12).fill(0) as number[];
    initialOrders.forEach((o, i) => {
      const m = months[i];
      if (m != null) {
        totals[m] += o.count;
        orderCounts[m] += 1;
      }
    });
    return { totals, orderCounts };
  }, [months, initialOrders]);

  async function save() {
    setSaving(true);
    setStatus({ text: "Saving…" });
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ text: "Saved — pushed a commit to GitHub. Live in about a minute.", kind: "ok" });
      } else {
        setStatus({ text: data.error || "Couldn't save. Try again.", kind: "err" });
      }
    } catch {
      setStatus({ text: "Couldn't reach the server. Try again.", kind: "err" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2 className="section-heading">Order months</h2>
      <p className="section-note">
        Birds split into {initialOrders.length} groups — 45 taxonomic orders, plus Passeriformes broken
        into its six deepest evolutionary lineages since it alone is 61% of all species — not a tidy
        twelve, so each one needs assigning to a month by hand before its species show up on the public
        calendar. More than one group can share a month.
      </p>

      <p className="orders-summary">
        <b>{assignedOrders}</b> / {initialOrders.length} orders assigned &middot;{" "}
        <b>{assignedSpecies.toLocaleString()}</b> / {totalSpecies.toLocaleString()} species covered
      </p>

      <div className="month-tally">
        {MONTH_NAMES.map((name, i) => (
          <div className={"month-tally-chip" + (perMonth.totals[i] ? "" : " empty")} key={name}>
            <span className="mt-name">{name.slice(0, 3)}</span>
            <span className="mt-count">{perMonth.totals[i] ? perMonth.totals[i].toLocaleString() : "—"}</span>
          </div>
        ))}
      </div>

      <div className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Species</th>
              <th>Month</th>
            </tr>
          </thead>
          <tbody>
            {initialOrders.map((o, i) => (
              <tr key={o.formal}>
                <td>
                  <div className="ord-name">{o.name}</div>
                  <div className="ord-formal">{o.formal}</div>
                </td>
                <td className="ord-count">{o.count.toLocaleString()}</td>
                <td>
                  <select
                    className="input ord-select"
                    value={months[i] == null ? "" : String(months[i])}
                    onChange={(e) => setMonth(i, e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {MONTH_NAMES.map((name, mi) => (
                      <option key={name} value={mi}>
                        {name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row">
        <button className="btn" onClick={save} disabled={saving}>
          Save order months
        </button>
        {status.text && <span className={"status" + (status.kind ? " " + status.kind : "")}>{status.text}</span>}
      </div>
    </section>
  );
}

const MAX_DESCRIPTION_LEN = 300;

function MonthDescriptionsSection({ initialMonthDescriptions }: { initialMonthDescriptions: string[] }) {
  const [descriptions, setDescriptions] = useState<string[]>(initialMonthDescriptions);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind?: "ok" | "err" }>({ text: "" });

  function setDescription(i: number, value: string) {
    setDescriptions((list) => list.map((d, idx) => (idx === i ? value : d)));
  }

  async function save() {
    setSaving(true);
    setStatus({ text: "Saving…" });
    try {
      const res = await fetch("/api/admin/month-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptions }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ text: "Saved — pushed a commit to GitHub. Live in about a minute.", kind: "ok" });
      } else {
        setStatus({ text: data.error || "Couldn't save. Try again.", kind: "err" });
      }
    } catch {
      setStatus({ text: "Couldn't reach the server. Try again.", kind: "err" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2 className="section-heading">Month descriptions</h2>
      <p className="section-note">
        A plain-language blurb shown under each month on the public calendar, below the list of
        assigned orders. Leave a month blank to show nothing extra there.
      </p>

      {MONTH_NAMES.map((name, i) => {
        const value = descriptions[i] ?? "";
        const over = value.length > MAX_DESCRIPTION_LEN;
        return (
          <div key={name}>
            <label className="field-label" htmlFor={"month-desc-" + i}>
              {name}
            </label>
            <textarea
              id={"month-desc-" + i}
              className="input"
              value={value}
              maxLength={MAX_DESCRIPTION_LEN + 20}
              onChange={(e) => setDescription(i, e.target.value)}
            />
            <div className={"char-count" + (over ? " over" : "")}>
              {value.length} / {MAX_DESCRIPTION_LEN}
            </div>
          </div>
        );
      })}

      <div className="row">
        <button className="btn" onClick={save} disabled={saving}>
          Save month descriptions
        </button>
        {status.text && <span className={"status" + (status.kind ? " " + status.kind : "")}>{status.text}</span>}
      </div>
    </section>
  );
}

function ContentSection({ initialContent }: { initialContent: ContentFields }) {
  const [fields, setFields] = useState<ContentFields>(initialContent);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind?: "ok" | "err" }>({ text: "" });

  function setField(key: keyof ContentFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus({ text: "Saving…" });
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ text: "Saved — pushed a commit to GitHub. Live in about a minute.", kind: "ok" });
      } else {
        setStatus({ text: data.error || "Couldn't save. Try again.", kind: "err" });
      }
    } catch {
      setStatus({ text: "Couldn't reach the server. Try again.", kind: "err" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2 className="section-heading">Site text</h2>
      <p className="section-note">The headline, tagline, and other fixed copy on the public site.</p>

      {CONTENT_FIELDS.map(({ key, label, max, multiline }) => {
        const value = fields[key];
        const over = value.length > max;
        return (
          <div key={key}>
            <label className="field-label" htmlFor={key}>
              {label}
            </label>
            {multiline ? (
              <textarea
                id={key}
                className="input"
                value={value}
                maxLength={max + 20}
                onChange={(e) => setField(key, e.target.value)}
              />
            ) : (
              <input
                id={key}
                className="input"
                type="text"
                value={value}
                maxLength={max + 20}
                onChange={(e) => setField(key, e.target.value)}
              />
            )}
            <div className={"char-count" + (over ? " over" : "")}>
              {value.length} / {max}
            </div>
          </div>
        );
      })}

      <div className="row">
        <button className="btn" onClick={save} disabled={saving}>
          Save site text
        </button>
        {status.text && <span className={"status" + (status.kind ? " " + status.kind : "")}>{status.text}</span>}
      </div>
    </section>
  );
}

let faqKeySeq = 0;
function nextFaqKey() {
  faqKeySeq += 1;
  return "faq-" + faqKeySeq;
}

type KeyedFaq = Faq & { _key: string };

function FaqSection({ initialFaqs }: { initialFaqs: Faq[] }) {
  const [faqs, setFaqs] = useState<KeyedFaq[]>(() => initialFaqs.map((f) => ({ ...f, _key: nextFaqKey() })));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind?: "ok" | "err" }>({ text: "" });
  // The dragged item's key lives in a ref, not state: onDrop can fire before
  // React has re-rendered from onDragStart's setState, so a state-only value
  // risks reading stale (null). dragKey/overKey stay as state purely to
  // drive the visual dragging/drag-over classes.
  const dragKeyRef = useRef<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  function updateFaq(i: number, field: "q" | "a", value: string) {
    setFaqs((list) => list.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }
  function removeFaq(i: number) {
    setFaqs((list) => list.filter((_, idx) => idx !== i));
  }
  function addFaq() {
    setFaqs((list) => [...list, { q: "", a: "", _key: nextFaqKey() }]);
  }

  // Only the hover target (overKey) updates during dragover, so the DOM
  // stays put while the browser is still hit-testing against it -- the
  // array itself is only spliced once, on drop.
  function moveFaq(fromKey: string, toKey: string) {
    setFaqs((list) => {
      const fromIndex = list.findIndex((f) => f._key === fromKey);
      const toIndex = list.findIndex((f) => f._key === toKey);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return list;
      const next = list.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setStatus({ text: "Saving…" });
    const cleaned = faqs.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q && f.a);
    try {
      const res = await fetch("/api/admin/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faqs: cleaned }),
      });
      const data = await res.json();
      if (res.ok) {
        setFaqs(cleaned.map((f) => ({ ...f, _key: nextFaqKey() })));
        setStatus({ text: "Saved — pushed a commit to GitHub. Live in about a minute.", kind: "ok" });
      } else {
        setStatus({ text: data.error || "Couldn't save. Try again.", kind: "err" });
      }
    } catch {
      setStatus({ text: "Couldn't reach the server. Try again.", kind: "err" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2 className="section-heading">FAQs</h2>
      <p className="section-note">Shown on the public site below the calendar. Drag a card by its handle to reorder.</p>

      {faqs.map((faq, i) => (
        <div
          className={
            "faq-row" +
            (dragKey === faq._key ? " dragging" : "") +
            (overKey === faq._key && dragKey !== faq._key ? " drag-over" : "")
          }
          key={faq._key}
          draggable
          onDragStart={(e) => {
            dragKeyRef.current = faq._key;
            setDragKey(faq._key);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            dragKeyRef.current = null;
            setDragKey(null);
            setOverKey(null);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={() => {
            if (dragKeyRef.current && dragKeyRef.current !== faq._key) setOverKey(faq._key);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const fromKey = dragKeyRef.current;
            if (fromKey && fromKey !== faq._key) moveFaq(fromKey, faq._key);
            dragKeyRef.current = null;
            setDragKey(null);
            setOverKey(null);
          }}
        >
          <div className="faq-row-head">
            <span className="drag-handle" title="Drag to reorder" aria-hidden="true">
              ⠿
            </span>
            <label className="field-label" style={{ marginTop: 0, marginBottom: 0 }}>
              Question
            </label>
          </div>
          <input
            className="input"
            type="text"
            maxLength={200}
            draggable={false}
            value={faq.q}
            onChange={(e) => updateFaq(i, "q", e.target.value)}
          />
          <label className="field-label">Answer</label>
          <textarea
            className="input"
            maxLength={1000}
            draggable={false}
            value={faq.a}
            onChange={(e) => updateFaq(i, "a", e.target.value)}
          />
          <div className="faq-row-footer">
            <button className="btn-danger" onClick={() => removeFaq(i)}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="row">
        <button className="btn btn-secondary" onClick={addFaq}>
          + Add another question
        </button>
      </div>
      <div className="row">
        <button className="btn" onClick={save} disabled={saving}>
          Save FAQs
        </button>
        {status.text && <span className={"status" + (status.kind ? " " + status.kind : "")}>{status.text}</span>}
      </div>
    </section>
  );
}
