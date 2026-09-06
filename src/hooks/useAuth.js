import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

// Drives real Supabase Auth (passwordless email OTP) plus the app-specific
// `profiles` row (display name + client/worker role) that Supabase Auth
// itself doesn't know about.
//
// authStage:
//   "loading"        - checking for an existing session on boot
//   "unconfigured"   - no Supabase env vars set (see .env.example)
//   "enter-email"    - signed out, waiting for an email address
//   "enter-code"     - a code was emailed, waiting for the 6-digit OTP
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

  async function sendCode(email) {
    setError("");
    setBusy(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return false;
    }
    setPendingEmail(email);
    setAuthStage("enter-code");
    return true;
  }

  async function verifyCode(code) {
    setError("");
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: code,
      type: "email",
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return false;
    }
    // onAuthStateChange above picks up the new session and moves the stage on.
    return true;
  }

  async function createProfile({ name, role }) {
    if (!session) return false;
    setError("");
    setBusy(true);
    const { data, error: insertError } = await supabase
      .from("profiles")
      .insert({ id: session.user.id, name, role })
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
    sendCode,
    verifyCode,
    createProfile,
    switchRole,
    signOut,
  };
}
