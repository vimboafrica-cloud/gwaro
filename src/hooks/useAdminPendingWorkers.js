import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

// Workers who've submitted a sample and are waiting on an admin decision.
// Only fetched while the admin view is open — no need to keep it live.
export function useAdminPendingWorkers(enabled) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return;
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("worker_approved", false)
      .not("worker_sample_submitted_at", "is", null)
      .order("worker_sample_submitted_at", { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setPending(data);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);

  async function approve(userId) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ worker_approved: true })
      .eq("id", userId);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    refresh();
    return true;
  }

  async function requestResubmission(userId, feedback) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ worker_sample: null, worker_sample_submitted_at: null, worker_sample_feedback: feedback || null })
      .eq("id", userId);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    refresh();
    return true;
  }

  return { pending, loading, error, approve, requestResubmission };
}
