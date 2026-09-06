import React, { useState, useEffect, useRef } from "react";
import {
  Wallet, FileText, PenLine, Mic, Briefcase, Clock, CheckCircle2,
  Flag, Star, Inbox, PlusCircle, ArrowRight, Loader2, AlertTriangle
} from "lucide-react";

const JOBS_KEY = "gwaro:jobs";
const PROFILE_KEY = "gwaro:profile";
const STORAGE_TIMEOUT_MS = 4000;

// ---- design tokens ----
const COLORS = {
  paper: "#EFEEE3",
  paperDark: "#E4E2D3",
  ink: "#211F1A",
  inkMuted: "#6B6759",
  line: "#D6D1BF",
  teal: "#0E5C56",
  tealSoft: "#DCEAE8",
  ochre: "#C1752B",
  ochreSoft: "#F3E2CE",
  sage: "#5C7A5E",
  sageSoft: "#E1E9DE",
  rust: "#A8452E",
  rustSoft: "#F0DFD9",
};

const CATEGORY_META = {
  Typing: { icon: FileText },
  Writing: { icon: PenLine },
  Transcription: { icon: Mic },
  "CV & business docs": { icon: Briefcase },
};
const CATEGORIES = Object.keys(CATEGORY_META);

const seedJobs = [
  {
    id: "GW-0001",
    category: "Transcription",
    title: "Sunday sermon, 45 minutes",
    description: "Audio file of a church service, need clean text with speaker labels.",
    budget: 8,
    deadline: "2026-09-08",
    status: "open",
    clientName: "Tanaka M.",
    workerName: null,
    rating: null,
    flagged: false,
  },
  {
    id: "GW-0002",
    category: "CV & business docs",
    title: "CV + cover letter for teaching post",
    description: "Update an old CV and write a cover letter for a primary school teaching vacancy.",
    budget: 6,
    deadline: "2026-09-10",
    status: "in_progress",
    clientName: "Rufaro C.",
    workerName: "Nyasha K.",
    rating: null,
    flagged: false,
  },
  {
    id: "GW-0003",
    category: "Typing",
    title: "Handwritten minutes, 12 pages",
    description: "Scanned photos of AGM minutes, need it typed up in a Word-ready format.",
    budget: 10,
    deadline: "2026-09-06",
    status: "approved",
    clientName: "Blessing N.",
    workerName: "Chiedza T.",
    rating: 5,
    flagged: false,
  },
];

function nextId(jobs) {
  return `GW-${String(jobs.length + 1).padStart(4, "0")}`;
}

function payoutBreakdown(budget) {
  const commission = budget * 0.15;
  const transferCost = budget * 0.03;
  const net = budget - commission - transferCost;
  return { commission, transferCost, net };
}

// races a promise against a timeout so a hung storage call can never freeze the UI
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("storage timeout")), ms)),
  ]);
}

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}

async function safeGet(key, shared) {
  if (!storageAvailable()) return { ok: false, value: null };
  try {
    const result = await withTimeout(window.storage.get(key, shared), STORAGE_TIMEOUT_MS);
    return { ok: true, value: result ? result.value : null };
  } catch (err) {
    return { ok: false, value: null };
  }
}

async function safeSet(key, value, shared) {
  if (!storageAvailable()) return false;
  try {
    const result = await withTimeout(window.storage.set(key, value, shared), STORAGE_TIMEOUT_MS);
    return !!result;
  } catch (err) {
    return false;
  }
}

async function safeDelete(key, shared) {
  if (!storageAvailable()) return false;
  try {
    await withTimeout(window.storage.delete(key, shared), STORAGE_TIMEOUT_MS);
    return true;
  } catch (err) {
    return false;
  }
}

function StatusBadge({ status, flagged }) {
  if (flagged) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm"
        style={{ background: COLORS.rustSoft, color: COLORS.rust }}
      >
        <Flag size={12} /> Reported
      </span>
    );
  }
  const map = {
    open: { label: "Open", bg: COLORS.tealSoft, fg: COLORS.teal },
    in_progress: { label: "In progress", bg: COLORS.ochreSoft, fg: COLORS.ochre },
    delivered: { label: "Awaiting approval", bg: COLORS.sageSoft, fg: COLORS.sage },
    approved: { label: "Completed", bg: COLORS.paperDark, fg: COLORS.inkMuted },
    cancelled: { label: "Cancelled & refunded", bg: COLORS.rustSoft, fg: COLORS.rust },
  };
  const m = map[status] || map.open;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm"
      style={{ background: m.bg, color: m.fg }}
    >
      {status === "approved" && <CheckCircle2 size={12} />}
      {m.label}
    </span>
  );
}

function Stars({ value, onRate }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onRate && onRate(n)}
          onMouseEnter={() => onRate && setHover(n)}
          onMouseLeave={() => onRate && setHover(0)}
          disabled={!onRate}
          className={onRate ? "cursor-pointer" : "cursor-default"}
        >
          <Star
            size={16}
            fill={(hover || value) >= n ? COLORS.ochre : "none"}
            color={(hover || value) >= n ? COLORS.ochre : COLORS.inkMuted}
          />
        </button>
      ))}
    </div>
  );
}

function JobCard({ job, children }) {
  const meta = CATEGORY_META[job.category] || { icon: FileText };
  const Icon = meta.icon;
  return (
    <div
      className="p-4 rounded-sm flex items-start justify-between gap-4"
      style={{ background: "white", border: `1px solid ${COLORS.line}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-xs" style={{ color: COLORS.inkMuted, fontFamily: "ui-monospace, monospace" }}>
            {job.id}
          </span>
          <span
            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-sm"
            style={{ background: COLORS.paperDark, color: COLORS.ink }}
          >
            <Icon size={11} /> {job.category}
          </span>
          <StatusBadge status={job.status} flagged={job.flagged} />
        </div>
        <h3 className="text-sm font-semibold mb-0.5">{job.title}</h3>
        {job.description && (
          <p className="text-sm mb-2" style={{ color: COLORS.inkMuted }}>{job.description}</p>
        )}
        <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: COLORS.inkMuted }}>
          <span className="font-medium" style={{ color: COLORS.ink }}>${job.budget.toFixed(2)}</span>
          <span className="flex items-center gap-1"><Clock size={11} /> {job.deadline}</span>
          <span>{job.clientName}{job.workerName ? ` → ${job.workerName}` : ""}</span>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function EmptyState({ text, action }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-12 rounded-sm gap-3"
      style={{ border: `1px dashed ${COLORS.line}` }}
    >
      <Inbox size={22} color={COLORS.inkMuted} />
      <p className="text-sm" style={{ color: COLORS.inkMuted }}>{text}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm font-medium px-3 py-1.5 rounded-sm"
          style={{ background: COLORS.teal, color: COLORS.paper }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs mb-1" style={{ color: COLORS.inkMuted }}>{label}</span>
      {children}
    </label>
  );
}

export default function Gwaro() {
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState(seedJobs);
  const [storageOn, setStorageOn] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [profileForm, setProfileForm] = useState({ name: "", role: "client" });

  const [tab, setTab] = useState("browse");
  const [viewMode, setViewMode] = useState("app"); // "app" | "admin"
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [adminError, setAdminError] = useState(false);

  const [form, setForm] = useState({
    category: CATEGORIES[0],
    title: "",
    description: "",
    budget: "",
    deadline: "",
  });

  const hasBooted = useRef(false);
  const wallet = 42.5;
  const role = profile ? profile.role : "client";

  // ---- boot: load profile + jobs together, bounded by a hard timeout ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = storageAvailable();
      if (!available && !cancelled) setStorageOn(false);

      const [profileResult, jobsResult] = await Promise.all([
        safeGet(PROFILE_KEY, false),
        safeGet(JOBS_KEY, true),
      ]);

      if (cancelled) return;

      if (profileResult.ok && profileResult.value) {
        try { setProfile(JSON.parse(profileResult.value)); } catch { setProfile(null); }
      } else {
        setProfile(null);
      }

      if (jobsResult.ok && jobsResult.value) {
        try { setJobs(JSON.parse(jobsResult.value)); } catch { setJobs(seedJobs); }
      } else {
        setJobs(seedJobs);
      }

      hasBooted.current = true;
      setBooting(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- persist job board changes in the background (never blocks the UI) ----
  useEffect(() => {
    if (!hasBooted.current || !storageOn) return;
    (async () => {
      setSaving(true);
      const ok = await safeSet(JOBS_KEY, JSON.stringify(jobs), true);
      setSaveError(!ok);
      setSaving(false);
    })();
  }, [jobs, storageOn]);

  function handleOnboard(e) {
    e.preventDefault();
    const trimmed = profileForm.name.trim();
    if (!trimmed) return;
    const newProfile = { name: trimmed, role: profileForm.role };
    setProfile(newProfile); // move forward immediately regardless of storage
    if (storageOn) safeSet(PROFILE_KEY, JSON.stringify(newProfile), false);
  }

  function switchRole(r) {
    const updated = { ...profile, role: r };
    setProfile(updated);
    if (storageOn) safeSet(PROFILE_KEY, JSON.stringify(updated), false);
  }

  function signOut() {
    setProfile(null);
    setProfileForm({ name: "", role: "client" });
    if (storageOn) safeDelete(PROFILE_KEY, false);
  }

  function updateJob(id, patch) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  function handlePost(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.budget || !form.deadline) return;
    const job = {
      id: nextId(jobs),
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      budget: Number(form.budget),
      deadline: form.deadline,
      status: "open",
      clientName: profile.name,
      workerName: null,
      rating: null,
      flagged: false,
    };
    setJobs((prev) => [job, ...prev]);
    setForm({ category: CATEGORIES[0], title: "", description: "", budget: "", deadline: "" });
    setTab("mine");
  }

  const flaggedJobs = jobs.filter((j) => j.flagged);

  function handleAdminUnlock(e) {
    e.preventDefault();
    if (adminCode === "gwaro-admin") {
      setAdminUnlocked(true);
      setAdminError(false);
    } else {
      setAdminError(true);
    }
  }

  function resolveDispute(id, action) {
    if (action === "release") updateJob(id, { flagged: false, status: "approved" });
    if (action === "refund") updateJob(id, { flagged: false, status: "cancelled" });
    if (action === "dismiss") updateJob(id, { flagged: false });
  }

  // ---------------- render: boot screen ----------------
  if (booting) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center font-sans"
        style={{ background: COLORS.paper, color: COLORS.inkMuted }}
      >
        <div className="flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  // ---------------- render: onboarding ----------------
  if (!profile) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center font-sans px-5"
        style={{ background: COLORS.paper, color: COLORS.ink }}
      >
        <form
          onSubmit={handleOnboard}
          className="w-full max-w-sm p-6 rounded-sm"
          style={{ background: "white", border: `1px solid ${COLORS.line}` }}
        >
          <h1
            className="text-2xl font-bold mb-1"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: COLORS.teal }}
          >
            Gwaro
          </h1>
          <p className="text-sm mb-5" style={{ color: COLORS.inkMuted }}>
            Typing and writing jobs, matched locally. What should we call you?
          </p>
          <label className="block mb-4">
            <span className="block text-xs mb-1" style={{ color: COLORS.inkMuted }}>Your name</span>
            <input
              autoFocus
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              placeholder="e.g. Tanaka Moyo"
              className="w-full px-3 py-2 text-sm rounded-sm"
              style={{ background: "white", border: `1px solid ${COLORS.line}` }}
            />
          </label>
          <label className="block mb-5">
            <span className="block text-xs mb-1" style={{ color: COLORS.inkMuted }}>I'm here to</span>
            <div className="flex gap-2">
              {[
                { value: "client", label: "Post jobs" },
                { value: "worker", label: "Do jobs" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setProfileForm({ ...profileForm, role: opt.value })}
                  className="flex-1 text-sm px-3 py-2 rounded-sm"
                  style={
                    profileForm.role === opt.value
                      ? { background: COLORS.teal, color: COLORS.paper }
                      : { background: COLORS.paperDark, color: COLORS.inkMuted }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </label>
          <button
            type="submit"
            disabled={!profileForm.name.trim()}
            className="w-full text-sm font-medium px-4 py-2 rounded-sm"
            style={{ background: COLORS.ochre, color: "white", opacity: profileForm.name.trim() ? 1 : 0.6 }}
          >
            Continue
          </button>
          {!storageOn && (
            <p className="text-xs mt-3 flex items-center gap-1" style={{ color: COLORS.rust }}>
              <AlertTriangle size={12} /> Running without saved storage — your data won't persist after this closes.
            </p>
          )}
          <p className="text-xs mt-3" style={{ color: COLORS.inkMuted }}>
            You can do both later — this just sets where you start.
          </p>
        </form>
      </div>
    );
  }

  // ---------------- render: admin ----------------
  if (viewMode === "admin") {
    return (
      <div
        className="min-h-screen w-full font-sans"
        style={{ background: COLORS.paper, color: COLORS.ink }}
      >
        <div className="max-w-2xl mx-auto px-5 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: COLORS.teal }}
            >
              Gwaro admin
            </h1>
            <button
              onClick={() => { setViewMode("app"); setAdminUnlocked(false); setAdminCode(""); }}
              className="text-sm"
              style={{ color: COLORS.inkMuted }}
            >
              ← Back to app
            </button>
          </div>

          {!adminUnlocked ? (
            <form
              onSubmit={handleAdminUnlock}
              className="max-w-sm p-5 rounded-sm"
              style={{ background: "white", border: `1px solid ${COLORS.line}` }}
            >
              <p className="text-sm mb-3" style={{ color: COLORS.inkMuted }}>
                Enter the admin passcode. This is a demo-only gate, not real security.
              </p>
              <input
                type="password"
                value={adminCode}
                onChange={(e) => { setAdminCode(e.target.value); setAdminError(false); }}
                placeholder="Passcode"
                className="w-full px-3 py-2 text-sm rounded-sm mb-2"
                style={{ background: "white", border: `1px solid ${COLORS.line}` }}
              />
              {adminError && (
                <p className="text-xs mb-2" style={{ color: COLORS.rust }}>That's not it — try again.</p>
              )}
              <button
                type="submit"
                className="w-full text-sm font-medium px-4 py-2 rounded-sm"
                style={{ background: COLORS.teal, color: COLORS.paper }}
              >
                Unlock
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm mb-1" style={{ color: COLORS.inkMuted }}>
                {flaggedJobs.length === 0
                  ? "No open reports right now."
                  : `${flaggedJobs.length} job${flaggedJobs.length > 1 ? "s" : ""} reported and waiting on a decision.`}
              </p>
              {flaggedJobs.length === 0 && (
                <EmptyState text="Reported jobs will show up here for review." />
              )}
              {flaggedJobs.map((job) => (
                <JobCard key={job.id} job={job}>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => resolveDispute(job.id, "release")}
                      className="text-sm font-medium px-3 py-1.5 rounded-sm w-48 text-center"
                      style={{ background: COLORS.teal, color: COLORS.paper }}
                    >
                      Release payment to worker
                    </button>
                    <button
                      onClick={() => resolveDispute(job.id, "refund")}
                      className="text-sm font-medium px-3 py-1.5 rounded-sm w-48 text-center"
                      style={{ background: COLORS.rust, color: "white" }}
                    >
                      Refund client
                    </button>
                    <button
                      onClick={() => resolveDispute(job.id, "dismiss")}
                      className="text-xs w-48 text-center"
                      style={{ color: COLORS.inkMuted }}
                    >
                      Dismiss report
                    </button>
                  </div>
                </JobCard>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- render: main app ----------------
  const myJobs = jobs.filter((j) =>
    role === "client" ? j.clientName === profile.name : j.workerName === profile.name
  );
  const openJobs = jobs.filter((j) => j.status === "open");

  const tabs = [
    { key: "browse", label: "Browse jobs" },
    { key: "post", label: "Post a job" },
    { key: "mine", label: `My jobs${myJobs.length ? ` (${myJobs.length})` : ""}` },
  ];

  return (
    <div className="min-h-screen w-full font-sans" style={{ background: COLORS.paper, color: COLORS.ink }}>
      <div className="max-w-2xl mx-auto px-5 py-8">
        {/* header */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-baseline gap-2">
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: COLORS.teal }}
            >
              Gwaro
            </h1>
            <span className="text-[11px] px-1.5 py-0.5 rounded-sm" style={{ background: COLORS.paperDark, color: COLORS.inkMuted }}>
              prototype
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-sm" style={{ background: COLORS.paperDark, color: COLORS.ink }}>
            <Wallet size={14} />
            <span>${wallet.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mb-5 flex-wrap gap-1">
          <p className="text-sm" style={{ color: COLORS.inkMuted }}>
            Typing and writing jobs, matched locally.
          </p>
          <p className="text-xs flex items-center gap-1" style={{ color: COLORS.inkMuted }}>
            {!storageOn ? (
              <span className="flex items-center gap-1" style={{ color: COLORS.rust }}>
                <AlertTriangle size={12} /> local only — not saved
              </span>
            ) : saveError ? (
              <span className="flex items-center gap-1" style={{ color: COLORS.rust }}>
                <AlertTriangle size={12} /> couldn't save last change
              </span>
            ) : saving ? (
              <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> saving…</span>
            ) : (
              "shared board · synced"
            )}
          </p>
        </div>

        {/* role switch */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="inline-flex p-0.5 rounded-sm" style={{ background: COLORS.paperDark }}>
            {["client", "worker"].map((r) => (
              <button
                key={r}
                onClick={() => switchRole(r)}
                className="px-3 py-1.5 text-sm rounded-sm capitalize transition-colors"
                style={role === r ? { background: COLORS.teal, color: COLORS.paper } : { color: COLORS.inkMuted }}
              >
                I'm a {r}
              </button>
            ))}
          </div>
          <p className="text-xs" style={{ color: COLORS.inkMuted }}>
            Signed in as <span style={{ color: COLORS.ink, fontWeight: 500 }}>{profile.name}</span>
            {" · "}
            <button onClick={signOut} className="underline">not you?</button>
          </p>
        </div>

        {/* tabs */}
        <div className="flex gap-5 mb-6 pb-2" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="text-sm pb-2 -mb-2.5"
              style={{
                color: tab === t.key ? COLORS.ink : COLORS.inkMuted,
                borderBottom: tab === t.key ? `2px solid ${COLORS.ochre}` : "2px solid transparent",
                fontWeight: tab === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* BROWSE */}
        {tab === "browse" && (
          <div className="space-y-3">
            {openJobs.length === 0 && <EmptyState text="No open jobs right now. Check back soon." />}
            {openJobs.map((job) => (
              <JobCard key={job.id} job={job}>
                {role === "worker" ? (
                  <button
                    onClick={() => updateJob(job.id, { status: "in_progress", workerName: profile.name })}
                    className="text-sm font-medium px-3 py-1.5 rounded-sm flex items-center gap-1"
                    style={{ background: COLORS.teal, color: COLORS.paper }}
                  >
                    Claim job <ArrowRight size={14} />
                  </button>
                ) : (
                  <span className="text-sm" style={{ color: COLORS.inkMuted }}>
                    {job.clientName === profile.name ? "Your job — awaiting a worker" : "Awaiting a worker"}
                  </span>
                )}
              </JobCard>
            ))}
          </div>
        )}

        {/* POST */}
        {tab === "post" &&
          (role !== "client" ? (
            <EmptyState
              text="Posting jobs is for clients."
              action={{ label: "Switch to client", onClick: () => switchRole("client") }}
            />
          ) : (
            <form onSubmit={handlePost} className="space-y-4 max-w-md">
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-sm"
                  style={{ background: "white", border: `1px solid ${COLORS.line}` }}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Type up 8 pages of handwritten notes"
                  className="w-full px-3 py-2 text-sm rounded-sm"
                  style={{ background: "white", border: `1px solid ${COLORS.line}` }}
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Details the worker needs to quote and deliver accurately"
                  className="w-full px-3 py-2 text-sm rounded-sm"
                  style={{ background: "white", border: `1px solid ${COLORS.line}` }}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Budget (USD)">
                  <input
                    type="number"
                    min="1"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                    placeholder="10"
                    className="w-full px-3 py-2 text-sm rounded-sm"
                    style={{ background: "white", border: `1px solid ${COLORS.line}` }}
                  />
                </Field>
                <Field label="Deadline">
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-sm"
                    style={{ background: "white", border: `1px solid ${COLORS.line}` }}
                  />
                </Field>
              </div>
              <button
                type="submit"
                className="text-sm font-medium px-4 py-2 rounded-sm flex items-center gap-1.5"
                style={{ background: COLORS.ochre, color: "white" }}
              >
                <PlusCircle size={15} /> Post job
              </button>
            </form>
          ))}

        {/* MINE */}
        {tab === "mine" && (
          <div className="space-y-3">
            {myJobs.length === 0 && (
              <EmptyState
                text={role === "client" ? "You haven't posted a job yet." : "You haven't claimed a job yet."}
                action={
                  role === "client"
                    ? { label: "Post a job", onClick: () => setTab("post") }
                    : { label: "Browse open jobs", onClick: () => setTab("browse") }
                }
              />
            )}
            {myJobs.map((job) => {
              const { commission, transferCost, net } = payoutBreakdown(job.budget);
              return (
                <JobCard key={job.id} job={job}>
                  <div className="flex flex-col items-end gap-2">
                    {role === "worker" && job.status === "in_progress" && !job.flagged && (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateJob(job.id, { flagged: true })}
                          className="text-xs flex items-center gap-1"
                          style={{ color: COLORS.rust }}
                        >
                          <Flag size={12} /> Report an issue
                        </button>
                        <button
                          onClick={() => updateJob(job.id, { status: "delivered" })}
                          className="text-sm font-medium px-3 py-1.5 rounded-sm"
                          style={{ background: COLORS.teal, color: COLORS.paper }}
                        >
                          Mark as delivered
                        </button>
                      </div>
                    )}

                    {role === "worker" && job.status === "delivered" && (
                      <span className="text-sm" style={{ color: COLORS.inkMuted }}>Waiting on client approval</span>
                    )}

                    {role === "client" && job.status === "delivered" && (
                      <div className="text-xs rounded-sm px-3 py-2 w-56" style={{ background: COLORS.paperDark }}>
                        <div className="flex justify-between mb-0.5">
                          <span style={{ color: COLORS.inkMuted }}>Job budget</span>
                          <span>${job.budget.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between mb-0.5">
                          <span style={{ color: COLORS.inkMuted }}>Platform fee (15%)</span>
                          <span>-${commission.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between mb-1.5">
                          <span style={{ color: COLORS.inkMuted }}>Mobile money transfer</span>
                          <span>-${transferCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between pt-1.5 font-medium" style={{ borderTop: `1px solid ${COLORS.line}` }}>
                          <span>Worker receives</span>
                          <span>${net.toFixed(2)}</span>
                        </div>
                        <button
                          onClick={() => updateJob(job.id, { status: "approved" })}
                          className="mt-2 w-full text-sm font-medium px-3 py-1.5 rounded-sm"
                          style={{ background: COLORS.ochre, color: "white" }}
                        >
                          Approve &amp; release payment
                        </button>
                      </div>
                    )}

                    {job.status === "approved" && role === "client" && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs" style={{ color: COLORS.inkMuted }}>
                          {job.rating ? "You rated this job" : "Rate the work"}
                        </span>
                        <Stars value={job.rating || 0} onRate={job.rating ? null : (n) => updateJob(job.id, { rating: n })} />
                      </div>
                    )}

                    {job.status === "approved" && role === "worker" && (
                      <div className="text-right">
                        <div className="text-sm font-medium" style={{ color: COLORS.sage }}>Paid ${net.toFixed(2)}</div>
                        {job.rating && <Stars value={job.rating} />}
                      </div>
                    )}

                    {job.flagged && (
                      <span className="text-xs" style={{ color: COLORS.rust }}>Reported — our team will review</span>
                    )}

                    {job.status === "cancelled" && (
                      <span className="text-xs" style={{ color: COLORS.rust }}>
                        {role === "client" ? "Refunded to your wallet" : "Job cancelled by admin"}
                      </span>
                    )}
                  </div>
                </JobCard>
              );
            })}
          </div>
        )}

        <div className="mt-8 pt-4 flex justify-center" style={{ borderTop: `1px solid ${COLORS.line}` }}>
          <button
            onClick={() => setViewMode("admin")}
            className="text-xs flex items-center gap-1.5"
            style={{ color: COLORS.inkMuted }}
          >
            Admin
            {flaggedJobs.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-sm" style={{ background: COLORS.rustSoft, color: COLORS.rust }}>
                {flaggedJobs.length} report{flaggedJobs.length > 1 ? "s" : ""}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
