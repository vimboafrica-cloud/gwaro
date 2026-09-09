import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

// Loads the shared job board from Supabase and keeps it live via Realtime,
// so a claim/delivery/approval/bid made on one device shows up on every
// other open browser without a refresh.
export function useJobs(enabled) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return;
    // worker_profile/client_profile embeds are needed so the admin payout
    // queue can show where to send money, and so client/worker can see each
    // other's phone number once a job is claimed. The bids(*) embed is
    // naturally privacy-scoped by bids' own RLS — a worker only ever gets
    // their own bid back here, a client gets every bid on their own job
    // (see App.jsx and supabase/migrations/0007_bidding.sql).
    const { data, error: fetchError } = await supabase
      .from("jobs")
      .select(
        "*, worker_profile:profiles!worker_id(ecocash_number, phone), client_profile:profiles!client_id(phone), bids(*)"
      )
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
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  async function postJob({ category, title, description, budget, deadline, clientId, clientName, biddingEnabled, currency }) {
    const { error: insertError } = await supabase.from("jobs").insert({
      category,
      title,
      description,
      budget,
      currency: currency === "ZIG" ? "ZIG" : "USD",
      deadline,
      client_id: clientId,
      client_name: clientName,
      bidding_enabled: !!biddingEnabled,
      status: biddingEnabled ? "bidding" : "awaiting_payment",
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

  async function submitBid(jobId, workerId, workerName, amount, note) {
    const { error: upsertError } = await supabase
      .from("bids")
      .upsert(
        { job_id: jobId, worker_id: workerId, worker_name: workerName, amount, note: note || null, status: "pending" },
        { onConflict: "job_id,worker_id" }
      );
    if (upsertError) {
      setError(upsertError.message);
      return false;
    }
    refresh();
    return true;
  }

  async function withdrawBid(bidId) {
    const { error: updateError } = await supabase.from("bids").update({ status: "withdrawn" }).eq("id", bidId);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    refresh();
    return true;
  }

  async function rejectBid(bidId) {
    const { error: updateError } = await supabase.from("bids").update({ status: "rejected" }).eq("id", bidId);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    refresh();
    return true;
  }

  async function acceptBid(bidId) {
    const { error: rpcError } = await supabase.rpc("accept_bid", { p_bid_id: bidId });
    if (rpcError) {
      setError(rpcError.message);
      return false;
    }
    refresh();
    return true;
  }

  return { jobs, loading, error, postJob, updateJob, submitBid, withdrawBid, rejectBid, acceptBid };
}
