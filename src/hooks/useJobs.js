import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

// Loads the shared job board from Supabase and keeps it live via Realtime,
// so a claim/delivery/approval made on one device shows up on every other
// open browser without a refresh.
export function useJobs(enabled) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return;
    // worker_profile/client_profile embeds are needed so the admin payout
    // queue can show where to send money, and so client/worker can see each
    // other's phone number once a job is claimed (see App.jsx).
    const { data, error: fetchError } = await supabase
      .from("jobs")
      .select("*, worker_profile:profiles!worker_id(ecocash_number, phone), client_profile:profiles!client_id(phone)")
      .order("created_at", { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setJobs(data);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled || !supabaseConfigured) return;
    setLoading(true);
    refresh();

    const channel = supabase
      .channel("jobs-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  async function postJob({ category, title, description, budget, deadline, clientId, clientName }) {
    const { error: insertError } = await supabase.from("jobs").insert({
      category,
      title,
      description,
      budget,
      deadline,
      client_id: clientId,
      client_name: clientName,
    });
    if (insertError) setError(insertError.message);
    return !insertError;
  }

  async function updateJob(id, patch) {
    // optimistic local update; Realtime will reconcile with the server row
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
    const { error: updateError } = await supabase.from("jobs").update(patch).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      refresh(); // roll back to server truth
    }
  }

  return { jobs, loading, error, postJob, updateJob };
}
