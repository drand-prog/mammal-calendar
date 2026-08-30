"use client";

import { useEffect, useRef, useState } from "react";

export type ContentFields = {
  eyebrow: string;
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  faqEyebrow: string;
  faqHeading: string;
};

export type Faq = { q: string; a: string };

const CONTENT_FIELDS: {
  key: keyof ContentFields;
  label: string;
  max: number;
  multiline?: boolean;
}[] = [
  { key: "eyebrow", label: "Eyebrow (small label above the title)", max: 80 },
  { key: "title", label: "Title", max: 100 },
  { key: "subtitle", label: "Subtitle", max: 300, multiline: true },
  { key: "searchPlaceholder", label: "Search box placeholder", max: 100 },
  { key: "faqEyebrow", label: "FAQ section eyebrow", max: 80 },
  { key: "faqHeading", label: "FAQ section heading", max: 100 },
];

type Session = "checking" | "out" | "in";

export default function AdminEditor({
  initialContent,
  initialFaqs,
}: {
  initialContent: ContentFields;
  initialFaqs: Faq[];
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
          <span className="eyebrow">Mammal Ephemeris</span>
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
        <span className="eyebrow">Mammal Ephemeris</span>
        <h1>Admin</h1>
        <p className="lede">
          Changes here commit straight to GitHub and trigger a Vercel redeploy of the public
          site — live for everyone in about a minute, not instantly.
        </p>
      </header>

      <ContentSection initialContent={initialContent} />
      <FaqSection initialFaqs={initialFaqs} />

      <button className="btn btn-secondary" onClick={logout}>
        Log out
      </button>
    </div>
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
      <p className="section-note">Shown on the public site below the wheel. Drag a card by its handle to reorder.</p>

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
