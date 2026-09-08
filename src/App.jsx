import React, { useState } from "react";
import {
  Wallet, FileText, PenLine, Mic, Briefcase, Clock, CheckCircle2,
  Flag, Star, Inbox, PlusCircle, ArrowRight, Loader2, AlertTriangle, Mail, Smartphone
} from "lucide-react";
import { supabaseConfigured } from "./lib/supabaseClient";
import { useAuth } from "./hooks/useAuth";
import { useJobs } from "./hooks/useJobs";

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

// The EcoCash number clients pay job budgets into (shown on every
// awaiting-payment job in the client's "My jobs" view).
const PLATFORM_ECOCASH_NUMBER = "0773141598";

// Plain-language platform rules, not a lawyer-drafted legal document — get
// this reviewed by one before treating it as enforceable in a real launch.
const PLATFORM_RULES = [
  {
    title: "Pay and get paid through Gwaro",
    body: "Job payments go through Gwaro's tracked flow — the client pays into the platform, the platform pays the worker out. Arranging payment outside the app for a job that started on Gwaro isn't allowed.",
  },
  {
    title: "Don't take a Gwaro match off-platform to dodge fees",
    body: "If you met someone through Gwaro, future jobs with them should also go through Gwaro. Repeatedly moving matched work off-platform after meeting through Gwaro can get an account suspended.",
  },
  {
    title: "Be honest in disputes",
    body: "False reports, false payment claims, or false delivery claims can result in suspension.",
  },
  {
    title: "Contact info is shared responsibly",
    body: "Your phone number is only shown to the other person once a job is paid for and claimed — it isn't shown before that.",
  },
  {
    title: "Disputes are reviewed at Gwaro's discretion",
    body: "Gwaro isn't liable for the quality of work exchanged between a client and worker; reported jobs are resolved based on whatever evidence is available.",
  },
];

function PlatformRules() {
  return (
    <div className="space-y-3">
      {PLATFORM_RULES.map((rule) => (
        <div key={rule.title}>
          <div className="text-xs font-semibold" style={{ color: COLORS.ink }}>{rule.title}</div>
          <div className="text-xs" style={{ color: COLORS.inkMuted }}>{rule.body}</div>
        </div>
      ))}
    </div>
  );
}

// Formats a local Zimbabwean number (e.g. "0771234567") into the digits-only
// international form wa.me needs (e.g. "263771234567"). Passes through
// numbers that already look international.
function toWhatsAppDigits(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "263" + digits.slice(1);
  if (digits.startsWith("263")) return digits;
  return digits;
}

function ContactLink({ label, name, phone }) {
  if (!phone) {
    return (
      <span className="text-xs" style={{ color: COLORS.inkMuted }}>
        {label}: {name} (no phone on file yet)
      </span>
    );
  }
  return (
    <a
      href={`https://wa.me/${toWhatsAppDigits(phone)}`}
      target="_blank"
      rel="noreferrer"
      className="text-xs underline flex items-center gap-1"
      style={{ color: COLORS.teal }}
    >
      <Smartphone size={11} /> {label}: {name} · {phone} (WhatsApp)
    </a>
  );
}

function payoutBreakdown(budget) {
  const commission = budget * 0.15;
  const transferCost = budget * 0.03;
  const net = budget - commission - transferCost;
  return { commission, transferCost, net };
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
    awaiting_payment: { label: "Awaiting payment", bg: COLORS.ochreSoft, fg: COLORS.ochre },
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
          <span className="font-medium" style={{ color: COLORS.ink }}>${Number(job.budget).toFixed(2)}</span>
          {job.deadline && <span className="flex items-center gap-1"><Clock size={11} /> {job.deadline}</span>}
          <span>{job.client_name}{job.worker_name ? ` → ${job.worker_name}` : ""}</span>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PayoutRow({ job, onMarkSent }) {
  const [reference, setReference] = useState("");
  const { net } = payoutBreakdown(Number(job.budget));
  return (
    <JobCard job={job}>
      <div className="flex flex-col items-end gap-2 w-56">
        <div className="text-xs w-full flex items-center justify-between" style={{ color: COLORS.inkMuted }}>
          <span className="flex items-center gap-1"><Smartphone size={12} /> {job.worker_name}</span>
          <span style={{ color: COLORS.ink, fontWeight: 500 }}>
            {job.worker_profile?.ecocash_number || "no number on file"}
          </span>
        </div>
        <div className="text-sm font-medium w-full text-right">Send ${net.toFixed(2)}</div>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="EcoCash transaction ref"
          className="w-full px-2 py-1.5 text-xs rounded-sm"
          style={{ background: "white", border: `1px solid ${COLORS.line}` }}
        />
        <button
          onClick={() => onMarkSent(job.id, reference)}
          className="w-full text-sm font-medium px-3 py-1.5 rounded-sm"
          style={{ background: COLORS.teal, color: COLORS.paper }}
        >
          Mark payout sent
        </button>
      </div>
    </JobCard>
  );
}

function CollectionRow({ job, onConfirm }) {
  const [reference, setReference] = useState("");
  return (
    <JobCard job={job}>
      <div className="flex flex-col items-end gap-2 w-56">
        <div className="text-xs w-full flex items-center justify-between" style={{ color: COLORS.inkMuted }}>
          <span className="flex items-center gap-1"><Smartphone size={12} /> {job.client_name}</span>
          <span style={{ color: COLORS.ink, fontWeight: 500 }}>
            {job.client_profile?.phone || "no number on file"}
          </span>
        </div>
        <div className="text-sm font-medium w-full text-right">Expect ${Number(job.budget).toFixed(2)}</div>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="EcoCash transaction ref"
          className="w-full px-2 py-1.5 text-xs rounded-sm"
          style={{ background: "white", border: `1px solid ${COLORS.line}` }}
        />
        <button
          onClick={() => onConfirm(job.id, reference)}
          className="w-full text-sm font-medium px-3 py-1.5 rounded-sm"
          style={{ background: COLORS.ochre, color: "white" }}
        >
          Mark payment received
        </button>
      </div>
    </JobCard>
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

function CenteredCard({ children }) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center font-sans px-5"
      style={{ background: COLORS.paper, color: COLORS.ink }}
    >
      <div className="w-full max-w-sm p-6 rounded-sm" style={{ background: "white", border: `1px solid ${COLORS.line}` }}>
        {children}
      </div>
    </div>
  );
}

function Logo() {
  return (
    <h1
      className="text-2xl font-bold mb-1"
      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: COLORS.teal }}
    >
      Gwaro
    </h1>
  );
}

export default function Gwaro() {
  const auth = useAuth();
  const jobsEnabled = auth.authStage === "ready";
  const jobsApi = useJobs(jobsEnabled);

  const [emailInput, setEmailInput] = useState("");
  const [profileForm, setProfileForm] = useState({ name: "", role: "client", phone: "", agreedTerms: false });
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [ecocashInput, setEcocashInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  const [tab, setTab] = useState("browse");
  const [viewMode, setViewMode] = useState("app"); // "app" | "admin"

  const [form, setForm] = useState({
    category: CATEGORIES[0],
    title: "",
    description: "",
    budget: "",
    deadline: "",
  });

  const wallet = 42.5; // placeholder until real EcoCash/OneMoney integration

  // ---------------- render: not configured ----------------
  if (!supabaseConfigured) {
    return (
      <CenteredCard>
        <Logo />
        <p className="text-sm mb-4" style={{ color: COLORS.inkMuted }}>
          Supabase isn't configured yet. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code>, fill in your project's URL and anon key, then restart{" "}
          <code>npm run dev</code>.
        </p>
        <p className="text-xs flex items-start gap-1.5" style={{ color: COLORS.rust }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          See README.md for the full setup steps, including running supabase/schema.sql.
        </p>
      </CenteredCard>
    );
  }

  // ---------------- render: loading ----------------
  if (auth.authStage === "loading") {
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

  // ---------------- render: enter email ----------------
  if (auth.authStage === "enter-email") {
    return (
      <CenteredCard>
        <Logo />
        <p className="text-sm mb-5" style={{ color: COLORS.inkMuted }}>
          Typing and writing jobs, matched locally. Sign in with your email — no password needed.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (emailInput.trim()) auth.sendLink(emailInput.trim()); }}
        >
          <Field label="Email address">
            <input
              autoFocus
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 text-sm rounded-sm"
              style={{ background: "white", border: `1px solid ${COLORS.line}` }}
            />
          </Field>
          {auth.error && <p className="text-xs mt-2" style={{ color: COLORS.rust }}>{auth.error}</p>}
          <button
            type="submit"
            disabled={auth.busy || !emailInput.trim()}
            className="w-full mt-4 text-sm font-medium px-4 py-2 rounded-sm flex items-center justify-center gap-1.5"
            style={{ background: COLORS.ochre, color: "white", opacity: auth.busy ? 0.7 : 1 }}
          >
            {auth.busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Send me a sign-in link
          </button>
        </form>
      </CenteredCard>
    );
  }

  // ---------------- render: check email ----------------
  if (auth.authStage === "check-email") {
    return (
      <CenteredCard>
        <Logo />
        <p className="text-sm mb-4" style={{ color: COLORS.inkMuted }}>
          We sent a sign-in link to <strong>{auth.pendingEmail}</strong>. Open it on this device
          to continue — this page will pick up automatically once you do.
        </p>
        <div className="flex items-center gap-2 text-sm mb-4" style={{ color: COLORS.inkMuted }}>
          <Loader2 size={14} className="animate-spin" /> Waiting for you to click the link…
        </div>
        {auth.error && <p className="text-xs mb-3" style={{ color: COLORS.rust }}>{auth.error}</p>}
        <button
          onClick={() => auth.sendLink(auth.pendingEmail)}
          disabled={auth.busy}
          className="text-xs underline"
          style={{ color: COLORS.inkMuted }}
        >
          Resend link
        </button>
      </CenteredCard>
    );
  }

  // ---------------- render: onboarding (first sign-in, no profile yet) ----------------
  if (auth.authStage === "onboarding") {
    return (
      <CenteredCard>
        <Logo />
        <p className="text-sm mb-5" style={{ color: COLORS.inkMuted }}>
          Almost there — what should we call you?
        </p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const trimmed = profileForm.name.trim();
          const trimmedPhone = profileForm.phone.trim();
          if (trimmed && trimmedPhone && profileForm.agreedTerms) {
            auth.createProfile({ name: trimmed, role: profileForm.role, phone: trimmedPhone, agreedToTerms: true });
          }
        }}>
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
          <label className="block mb-4">
            <span className="block text-xs mb-1" style={{ color: COLORS.inkMuted }}>Phone number</span>
            <input
              type="tel"
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              placeholder="e.g. 0771234567"
              className="w-full px-3 py-2 text-sm rounded-sm"
              style={{ background: "white", border: `1px solid ${COLORS.line}` }}
            />
            <span className="block text-xs mt-1" style={{ color: COLORS.inkMuted }}>
              Shared with the other person only once a job is claimed, so you can coordinate on WhatsApp.
            </span>
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
          <div className="mb-5">
            <button
              type="button"
              onClick={() => setRulesExpanded(!rulesExpanded)}
              className="text-xs underline mb-2"
              style={{ color: COLORS.teal }}
            >
              {rulesExpanded ? "Hide" : "View"} platform rules
            </button>
            {rulesExpanded && (
              <div className="p-3 mb-2 rounded-sm" style={{ background: COLORS.paperDark }}>
                <PlatformRules />
              </div>
            )}
            <label className="flex items-start gap-2 text-xs" style={{ color: COLORS.ink }}>
              <input
                type="checkbox"
                checked={profileForm.agreedTerms}
                onChange={(e) => setProfileForm({ ...profileForm, agreedTerms: e.target.checked })}
                className="mt-0.5"
              />
              I've read and agree to the platform rules, including not taking jobs off-platform to avoid fees.
            </label>
          </div>
          {auth.error && <p className="text-xs mb-3" style={{ color: COLORS.rust }}>{auth.error}</p>}
          <button
            type="submit"
            disabled={auth.busy || !profileForm.name.trim() || !profileForm.phone.trim() || !profileForm.agreedTerms}
            className="w-full text-sm font-medium px-4 py-2 rounded-sm"
            style={{
              background: COLORS.ochre,
              color: "white",
              opacity: profileForm.name.trim() && profileForm.phone.trim() && profileForm.agreedTerms ? 1 : 0.6,
            }}
          >
            Continue
          </button>
          <p className="text-xs mt-3" style={{ color: COLORS.inkMuted }}>
            You can do both later — this just sets where you start.
          </p>
        </form>
      </CenteredCard>
    );
  }

  // ---------------- from here: auth.authStage === "ready" ----------------
  const { profile } = auth;

  if (profile.suspended) {
    return (
      <CenteredCard>
        <Logo />
        <p className="text-sm mb-3" style={{ color: COLORS.rust }}>
          Your account has been suspended.
        </p>
        {profile.suspension_reason && (
          <p className="text-sm mb-4" style={{ color: COLORS.inkMuted }}>{profile.suspension_reason}</p>
        )}
        <button onClick={auth.signOut} className="text-sm underline" style={{ color: COLORS.inkMuted }}>
          Sign out
        </button>
      </CenteredCard>
    );
  }

  if (!profile.agreed_to_terms_at) {
    return (
      <CenteredCard>
        <Logo />
        <p className="text-sm mb-4" style={{ color: COLORS.inkMuted }}>
          The platform rules have been updated — please review and accept them to continue.
        </p>
        <div className="p-3 mb-4 rounded-sm" style={{ background: COLORS.paperDark }}>
          <PlatformRules />
        </div>
        {auth.error && <p className="text-xs mb-3" style={{ color: COLORS.rust }}>{auth.error}</p>}
        <button
          onClick={auth.acceptTerms}
          disabled={auth.busy}
          className="w-full text-sm font-medium px-4 py-2 rounded-sm"
          style={{ background: COLORS.ochre, color: "white" }}
        >
          I agree — continue
        </button>
      </CenteredCard>
    );
  }

  const role = profile.role;
  const jobs = jobsApi.jobs;
  const flaggedJobs = jobs.filter((j) => j.flagged);
  const pendingPayouts = jobs.filter((j) => j.payout_status === "pending");
  const awaitingPayment = jobs.filter((j) => j.status === "awaiting_payment");

  function confirmPaymentReceived(id, reference) {
    updateJob(id, {
      status: "open",
      collection_reference: reference.trim() || null,
      collection_confirmed_at: new Date().toISOString(),
    });
  }

  function updateJob(id, patch) {
    jobsApi.updateJob(id, patch);
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.budget || !form.deadline) return;
    const ok = await jobsApi.postJob({
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      budget: Number(form.budget),
      deadline: form.deadline,
      clientId: profile.id,
      clientName: profile.name,
    });
    if (ok) {
      setForm({ category: CATEGORIES[0], title: "", description: "", budget: "", deadline: "" });
      setTab("mine");
    }
  }

  function resolveDispute(id, action) {
    if (action === "release") updateJob(id, { flagged: false, status: "approved", payout_status: "pending" });
    if (action === "refund") updateJob(id, { flagged: false, status: "cancelled" });
    if (action === "dismiss") updateJob(id, { flagged: false });
  }

  function suspendFromDispute(userId, jobId) {
    auth.suspendUser(userId, `Suspended from reviewing job ${jobId}'s dispute.`);
  }

  function markPayoutSent(id, reference) {
    updateJob(id, {
      payout_status: "sent",
      payout_reference: reference.trim() || null,
      payout_sent_at: new Date().toISOString(),
    });
  }

  // ---------------- render: admin ----------------
  if (viewMode === "admin") {
    return (
      <div className="min-h-screen w-full font-sans" style={{ background: COLORS.paper, color: COLORS.ink }}>
        <div className="max-w-2xl mx-auto px-5 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: COLORS.teal }}
            >
              Gwaro admin
            </h1>
            <button onClick={() => setViewMode("app")} className="text-sm" style={{ color: COLORS.inkMuted }}>
              ← Back to app
            </button>
          </div>
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-3">Incoming payments</h2>
            <p className="text-sm mb-3" style={{ color: COLORS.inkMuted }}>
              {awaitingPayment.length === 0
                ? "Nothing waiting on a client payment."
                : `${awaitingPayment.length} job${awaitingPayment.length > 1 ? "s" : ""} posted, waiting for payment before going live.`}
            </p>
            <div className="space-y-3">
              {awaitingPayment.length === 0 && (
                <EmptyState text="New jobs show up here until you confirm the client's EcoCash payment arrived." />
              )}
              {awaitingPayment.map((job) => (
                <CollectionRow key={job.id} job={job} onConfirm={confirmPaymentReceived} />
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-3">Reported jobs</h2>
            <p className="text-sm mb-3" style={{ color: COLORS.inkMuted }}>
              {flaggedJobs.length === 0
                ? "No open reports right now."
                : `${flaggedJobs.length} job${flaggedJobs.length > 1 ? "s" : ""} reported and waiting on a decision.`}
            </p>
            <div className="space-y-3">
              {flaggedJobs.length === 0 && <EmptyState text="Reported jobs will show up here for review." />}
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
                    <div className="flex items-center gap-3 mt-1 pt-1 w-48 justify-center" style={{ borderTop: `1px solid ${COLORS.line}` }}>
                      <button
                        onClick={() => suspendFromDispute(job.client_id, job.id)}
                        className="text-xs underline"
                        style={{ color: COLORS.rust }}
                      >
                        Suspend client
                      </button>
                      <button
                        onClick={() => suspendFromDispute(job.worker_id, job.id)}
                        className="text-xs underline"
                        style={{ color: COLORS.rust }}
                      >
                        Suspend worker
                      </button>
                    </div>
                  </div>
                </JobCard>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">Payouts</h2>
            <p className="text-sm mb-3" style={{ color: COLORS.inkMuted }}>
              {pendingPayouts.length === 0
                ? "Nothing waiting to be paid out."
                : `${pendingPayouts.length} payout${pendingPayouts.length > 1 ? "s" : ""} approved and waiting to be sent.`}
            </p>
            <p className="text-xs mb-3 flex items-start gap-1.5" style={{ color: COLORS.inkMuted }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              No automatic EcoCash integration yet — send each payout from your own EcoCash app,
              then record the transaction reference here.
            </p>
            <div className="space-y-3">
              {pendingPayouts.length === 0 && <EmptyState text="Approved jobs waiting on payment show up here." />}
              {pendingPayouts.map((job) => (
                <PayoutRow key={job.id} job={job} onMarkSent={markPayoutSent} />
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ---------------- render: main app ----------------
  const myJobs = jobs.filter((j) =>
    role === "client" ? j.client_id === profile.id : j.worker_id === profile.id
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

        <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
          <p className="text-sm" style={{ color: COLORS.inkMuted }}>
            Typing and writing jobs, matched locally.
          </p>
          <p className="text-xs flex items-center gap-1" style={{ color: COLORS.inkMuted }}>
            {jobsApi.error ? (
              <span className="flex items-center gap-1" style={{ color: COLORS.rust }}>
                <AlertTriangle size={12} /> {jobsApi.error}
              </span>
            ) : jobsApi.loading ? (
              <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> loading…</span>
            ) : (
              "shared board · live"
            )}
          </p>
        </div>
        <p className="text-xs mb-5" style={{ color: COLORS.inkMuted }}>
          Payments are held until approved and disputes are reviewed here — that protection goes away for anything arranged outside Gwaro.
        </p>

        {/* role switch */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="inline-flex p-0.5 rounded-sm" style={{ background: COLORS.paperDark }}>
            {["client", "worker"].map((r) => (
              <button
                key={r}
                onClick={() => auth.switchRole(r)}
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
            <button onClick={auth.signOut} className="underline">not you?</button>
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

        {!profile.phone && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (phoneInput.trim()) { auth.updatePhone(phoneInput.trim()); setPhoneInput(""); } }}
            className="flex items-center gap-2 mb-3 p-3 rounded-sm flex-wrap"
            style={{ background: COLORS.tealSoft, border: `1px solid ${COLORS.line}` }}
          >
            <Smartphone size={14} style={{ color: COLORS.teal }} className="shrink-0" />
            <span className="text-xs" style={{ color: COLORS.ink }}>
              Add your phone number so whoever you work with can reach you on WhatsApp.
            </span>
            <input
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="e.g. 0771234567"
              className="text-sm px-2 py-1 rounded-sm flex-1 min-w-[140px]"
              style={{ background: "white", border: `1px solid ${COLORS.line}` }}
            />
            <button
              type="submit"
              className="text-xs font-medium px-3 py-1.5 rounded-sm"
              style={{ background: COLORS.teal, color: COLORS.paper }}
            >
              Save
            </button>
          </form>
        )}

        {role === "worker" && !profile.ecocash_number && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (ecocashInput.trim()) { auth.updateEcoCashNumber(ecocashInput.trim()); setEcocashInput(""); } }}
            className="flex items-center gap-2 mb-6 p-3 rounded-sm flex-wrap"
            style={{ background: COLORS.ochreSoft, border: `1px solid ${COLORS.line}` }}
          >
            <Smartphone size={14} style={{ color: COLORS.ochre }} className="shrink-0" />
            <span className="text-xs" style={{ color: COLORS.ink }}>
              Add your EcoCash number so clients can pay you once you claim a job.
            </span>
            <input
              value={ecocashInput}
              onChange={(e) => setEcocashInput(e.target.value)}
              placeholder="e.g. 0771234567"
              className="text-sm px-2 py-1 rounded-sm flex-1 min-w-[140px]"
              style={{ background: "white", border: `1px solid ${COLORS.line}` }}
            />
            <button
              type="submit"
              className="text-xs font-medium px-3 py-1.5 rounded-sm"
              style={{ background: COLORS.ochre, color: "white" }}
            >
              Save
            </button>
          </form>
        )}

        {/* BROWSE */}
        {tab === "browse" && (
          <div className="space-y-3">
            {openJobs.length === 0 && <EmptyState text="No open jobs right now. Check back soon." />}
            {openJobs.map((job) => (
              <JobCard key={job.id} job={job}>
                {role === "worker" ? (
                  <button
                    onClick={() => updateJob(job.id, { status: "in_progress", worker_id: profile.id, worker_name: profile.name })}
                    className="text-sm font-medium px-3 py-1.5 rounded-sm flex items-center gap-1"
                    style={{ background: COLORS.teal, color: COLORS.paper }}
                  >
                    Claim job <ArrowRight size={14} />
                  </button>
                ) : (
                  <span className="text-sm" style={{ color: COLORS.inkMuted }}>
                    {job.client_id === profile.id ? "Your job — awaiting a worker" : "Awaiting a worker"}
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
              action={{ label: "Switch to client", onClick: () => auth.switchRole("client") }}
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
              const { commission, transferCost, net } = payoutBreakdown(Number(job.budget));
              return (
                <JobCard key={job.id} job={job}>
                  <div className="flex flex-col items-end gap-2">
                    {job.worker_id && job.status !== "cancelled" && (
                      role === "client" ? (
                        <ContactLink label="Worker" name={job.worker_name} phone={job.worker_profile?.phone} />
                      ) : (
                        <ContactLink label="Client" name={job.client_name} phone={job.client_profile?.phone} />
                      )
                    )}
                    {role === "client" && job.status === "awaiting_payment" && (
                      <div className="text-xs rounded-sm px-3 py-2 w-56 text-right" style={{ background: COLORS.paperDark }}>
                        <div style={{ color: COLORS.inkMuted }}>Send this job's budget via EcoCash to:</div>
                        <div className="text-sm font-medium my-1">{PLATFORM_ECOCASH_NUMBER}</div>
                        <div className="font-medium">${Number(job.budget).toFixed(2)}</div>
                        <div className="mt-1" style={{ color: COLORS.inkMuted }}>
                          We'll open it up to workers once payment is confirmed.
                        </div>
                      </div>
                    )}

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
                          <span>${Number(job.budget).toFixed(2)}</span>
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
                          onClick={() => updateJob(job.id, { status: "approved", payout_status: "pending" })}
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
                        {job.payout_status === "sent" ? (
                          <>
                            <div className="text-sm font-medium" style={{ color: COLORS.sage }}>Paid ${net.toFixed(2)}</div>
                            {job.payout_reference && (
                              <div className="text-xs" style={{ color: COLORS.inkMuted }}>ref: {job.payout_reference}</div>
                            )}
                          </>
                        ) : (
                          <div className="text-sm flex items-center justify-end gap-1" style={{ color: COLORS.ochre }}>
                            <Loader2 size={12} className="animate-spin" /> Payment pending (${net.toFixed(2)})
                          </div>
                        )}
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

        {profile.is_admin && (
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
        )}
      </div>
    </div>
  );
}
