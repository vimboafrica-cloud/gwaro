import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

// Drives real Supabase Auth (passwordless email magic link) plus the
// app-specific `profiles` row (display name + client/worker role) that
// Supabase Auth itself doesn't know about.
//
// Magic link rather than a 6-digit code: Supabase's built-in email sender
// (free tier, no custom SMTP) uses a fixed template that isn't editable, and
// that template only carries the confirmation link, not a {{ .Token }}
// code. The link click-through works with that default template as-is.
//
// authStage:
//   "loading"        - checking for an existing session on boot
//   "unconfigured"   - no Supabase env vars set (see .env.example)
//   "enter-email"    - signed out, waiting for an email address
//   "check-email"    - a link was emailed, waiting for it to be clicked
//   "onboarding"     - signed in, but no profile row yet (first sign-in)
//   "ready"          - signed in with a profile loaded
export function useAuth() {
  const [authStage, setAuthStage] = useState(supabaseConfigured ? "loading" : "unconfigured");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (fetchError) {
      setError(fetchError.message);
      return null;
    }
    return data;
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const currentSession = data.session;
      setSession(currentSession);
      if (currentSession) {
        const prof = await loadProfile(currentSession.user.id);
        if (cancelled) return;
        setProfile(prof);
        setAuthStage(prof ? "ready" : "onboarding");
      } else {
        setAuthStage("enter-email");
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setAuthStage("enter-email");
        return;
      }
      const prof = await loadProfile(newSession.user.id);
      setProfile(prof);
      setAuthStage(prof ? "ready" : "onboarding");
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  async function sendLink(email) {
    setError("");
    setBusy(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return false;
    }
    setPendingEmail(email);
    setAuthStage("check-email");
    return true;
  }

  async function createProfile({ name, role, phone }) {
    if (!session) return false;
    setError("");
    setBusy(true);
    const { data, error: insertError } = await supabase
      .from("profiles")
      .insert({ id: session.user.id, name, role, phone })
      .select()
      .single();
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return false;
    }
    setProfile(data);
    setAuthStage("ready");
    return true;
  }

  async function switchRole(role) {
    if (!profile) return;
    const previous = profile;
    setProfile({ ...profile, role }); // optimistic
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", profile.id);
    if (updateError) {
      setProfile(previous);
      setError(updateError.message);
    }
  }

  async function updatePhone(phone) {
    if (!profile) return false;
    const previous = profile;
    setProfile({ ...profile, phone }); // optimistic
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("id", profile.id);
    if (updateError) {
      setProfile(previous);
      setError(updateError.message);
      return false;
    }
    return true;
  }

  async function updateEcoCashNumber(ecocashNumber) {
    if (!profile) return false;
    const previous = profile;
    setProfile({ ...profile, ecocash_number: ecocashNumber }); // optimistic
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ ecocash_number: ecocashNumber })
      .eq("id", profile.id);
    if (updateError) {
      setProfile(previous);
      setError(updateError.message);
      return false;
    }
    return true;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPendingEmail("");
  }

  return {
    authStage,
    session,
    profile,
    pendingEmail,
    error,
    busy,
    sendLink,
    createProfile,
    switchRole,
    updatePhone,
    updateEcoCashNumber,
    signOut,
  };
}
