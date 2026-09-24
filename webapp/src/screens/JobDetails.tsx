import JobScopeChanges from "../components/JobScopeChanges";
// src/screens/JobDetails.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, Share, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from "../ui/paper";
import { supabase } from "../lib/supabase";
import {
  BRAND_COLORS,
  BRAND_RADII,
  BRAND_SPACING,
  BRAND_TYPOGRAPHY,
} from "../theme";
import { getJobStatusCopy } from "../utils/jobStatusCopy";
import { buildJobPaymentBreakdown } from "../utils/jobPayments";
import { formatGBPCents } from "../utils/money";
import { hasJobPhotoStage } from "../utils/jobImages";
import {
  getCustomerStatusMeta,
  getTraderStatusMeta,
} from "../utils/statusStyles";
import { invokeEdgeFunction } from "../utils/edgeFunctions";
import {
  acceptJob,
  sellerMarksDone,
  clientNotDone,
  declineJobWithReason,
} from "../api/jobs";
import BottomCurtain from "../components/BottomCurtain";
import ScreenState from "../components/ScreenState";
import BrandScreenHeader from "../components/BrandScreenHeader";
import ResponsivePageScrollView from "../components/ResponsivePageScrollView";
import JobProgressTimeline from "../components/JobProgressTimeline";

type Job = {
  scope_change_status?: string | null;
  id: string;
  ref_code: string | null;
  trader_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  duration_days: number;
  planned_start_date: string | null;
  flex_days: number | null;
  start_date: string | null;
  end_date: string | null;
  started_trader: boolean | null;
  started_client: boolean | null;
  status:
    | "proposed"
    | "accepted"
    | "funded"
    | "in_progress"
    | "seller_done"
    | "client_done"
    | "completed"
    | "disputed"
    | "cancelled";
  created_at: string;
};

type JobItem = {
  id?: string;
  job_id: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  qty: number;
  price_cents: number; // per item
};

type PartialPaymentRequest = {
  id: string;
  job_id: string;
  amount_cents: number;
  reason: string;
  status: "requested" | "approved" | "declined" | "released" | "cancelled";
  created_at: string;
};

const statusLabel: Record<Job["status"], string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  funded: "Funded",
  in_progress: "In progress",
  seller_done: "Awaiting client",
  client_done: "Awaiting trader",
  completed: "Done",
  disputed: "Disputed",
  cancelled: "Cancelled",
};

const statusExplainer: Record<Job["status"], { what: string; tip?: string }> = {
  proposed: {
    what: "Your tradie has submitted the job breakdown. Review it, then accept to move forward.",
    tip: "Message your tradie if anything needs changing before you accept.",
  },
  accepted: {
    what: "The job is accepted. Next step is usually payment to secure the booking (if required).",
    tip: "Your money stays protected until the job is confirmed complete.",
  },
  funded: {
    what: "Payment has been received and is held securely by Yakka until the job is complete.",
    tip: "Keep photos/notes in Messages for stronger protection.",
  },
  in_progress: {
    what: "Work is in progress. Payment remains protected until completion is confirmed.",
    tip: "Upload progress photos in Messages in case anything needs reviewing later.",
  },
  seller_done: {
    what: "Your tradie marked the job as complete. Confirm completion or raise an issue if something isn’t right.",
    tip: "Capture clear photos if you need to raise a dispute.",
  },
  client_done: {
    what: "You confirmed completion. Yakka is processing the final payment to the tradie.",
    tip: "This can take 1–2 business days depending on the bank.",
  },
  completed: {
    what: "The job is complete and payment has been released.",
    tip: "You can view the chat history for records and receipts.",
  },
  disputed: {
    what: "A dispute has been raised. Payment remains on hold while Yakka reviews the evidence.",
    tip: "You may be contacted by email for additional details.",
  },
  cancelled: {
    what: "This job was cancelled/declined.",
    tip: "You can create a new job or request a new proposal.",
  },
};

// ---- helpers ----
function isoToDMY(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function todayYMD() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function absDiffDays(aIso: string, bIso: string) {
  const a = new Date(aIso + "T00:00:00").getTime();
  const b = new Date(bIso + "T00:00:00").getTime();
  return Math.floor(Math.abs(a - b) / 86400000);
}
function moneyToCents(input: string) {
  const cleaned = String(input || "")
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");
  const m = cleaned.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!m) return null;
  const pounds = Number(m[1] || 0);
  const pence = Number((m[2] || "").padEnd(2, "0") || 0);
  return pounds * 100 + pence;
}
async function copyToClipboard(text: string) {
  try {
    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      (navigator as any).clipboard
    ) {
      await (navigator as any).clipboard.writeText(text);
      Alert.alert("Copied", "Copied to clipboard.");
      return;
    }
  } catch {}
  try {
    // @ts-ignore optional dependency
    const Clipboard = require("@react-native-clipboard/clipboard")?.default;
    if (Clipboard?.setString) {
      Clipboard.setString(text);
      Alert.alert("Copied", "Copied to clipboard.");
      return;
    }
  } catch {}
  try {
    await Share.share({ message: text });
  } catch {
    Alert.alert("Copy failed", "Could not access clipboard.");
  }
}

export default function JobDetails({ route }: any) {
  const { jobId } = route.params as { jobId: string };
  const theme = useTheme();
  const nav = useNavigation<any>();

  const [me, setMe] = useState<any>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  // breakdown items
  const [items, setItems] = useState<JobItem[]>([]);
  const [itemsLoadMode, setItemsLoadMode] = useState<"table" | "fallback">(
    "fallback",
  );
  const [partialRequests, setPartialRequests] = useState<
    PartialPaymentRequest[]
  >([]);
  const [editMode, setEditMode] = useState(false);

  // add item fields (edit mode)
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemPrice, setNewItemPrice] = useState(""); // GBP

  // dialogs
  const [statusInfoOpen, setStatusInfoOpen] = useState(false);

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineText, setDeclineText] = useState("");
  const [declining, setDeclining] = useState(false);

  const [notDoneOpen, setNotDoneOpen] = useState(false);
  const [notDoneText, setNotDoneText] = useState("");
  const [submittingNotDone, setSubmittingNotDone] = useState(false);

  const isTrader = useMemo(
    () => !!me && !!job && me.id === job.trader_id,
    [me, job],
  );
  const isClient = useMemo(
    () => !!me && !!job && me.id === job.client_id,
    [me, job],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (pErr) {
      Alert.alert("Error", pErr.message);
      setLoading(false);
      return;
    }
    setMe(prof);

    const { data: j, error: jErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (jErr) {
      Alert.alert("Error", jErr.message);
      setLoading(false);
      return;
    }
    const jobRow = j as Job;
    setJob(jobRow);

    // Try load breakdown items table (if you have it)
    // If the table doesn't exist, we fall back to a single line item from job.price_cents.
    try {
      const { data: rows, error } = await supabase
        .from("job_items")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      if (rows && rows.length) {
        const mapped: JobItem[] = rows.map((r: any) => ({
          id: r.id,
          job_id: r.job_id,
          title: r.title ?? "Item",
          description: r.description ?? null,
          notes: r.notes ?? null,
          qty: Number(r.qty ?? 1),
          price_cents: Number(r.price_cents ?? 0),
        }));
        setItems(mapped);
        setItemsLoadMode("table");
      } else {
        // no items in table -> fallback to job price
        setItems([
          {
            job_id: jobId,
            title: jobRow.title || "Job",
            qty: 1,
            price_cents: Number(jobRow.price_cents ?? 0),
          },
        ]);
        setItemsLoadMode("fallback");
      }
    } catch {
      // table missing or RLS denies -> fallback
      setItems([
        {
          job_id: jobId,
          title: jobRow.title || "Job",
          qty: 1,
          price_cents: Number(jobRow.price_cents ?? 0),
        },
      ]);
      setItemsLoadMode("fallback");
    }

    try {
      const { data: requests } = await supabase
        .from("partial_payment_requests")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      setPartialRequests((requests || []) as PartialPaymentRequest[]);
    } catch {
      setPartialRequests([]);
    }

    setEditMode(false);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const subtotalCents = useMemo(
    () =>
      items.reduce(
        (acc, it) => acc + Math.max(0, it.qty) * Math.max(0, it.price_cents),
        0,
      ),
    [items],
  );
  const paymentBreakdown = useMemo(
    () => buildJobPaymentBreakdown(job as any, items),
    [items, job],
  );

  const buildRefInstructions = useCallback(
    (code: string) => {
      const traderName = me?.name ?? "me";
      const upper = String(code || "").toUpperCase();
      const universal = `https://yakka.app/join/${upper}`;
      const appscheme = `yakka://join/${upper}`;

      return `Hi! To book & chat with ${traderName} on Yakka:

1) Download/open Yakka
2) Sign up as a Client
3) Use this link to auto-fill the code: ${universal}
   (If the app asks, the code is: ${upper})

If the link doesn't open the app automatically, try this: ${appscheme}

This opens our chat so I can send the proposal.`;
    },
    [me?.name],
  );

  const onShareJob = useCallback(async () => {
    if (!job?.ref_code) {
      Alert.alert(
        "No code yet",
        "This job does not have a reference code yet.",
      );
      return;
    }
    await copyToClipboard(buildRefInstructions(job.ref_code));
  }, [job?.ref_code, buildRefInstructions]);

  const onMessages = useCallback(() => {
    if (!job) return;
    nav.navigate("Chat", { jobId: job.id });
  }, [nav, job]);

  const onPayNow = useCallback(() => {
    if (!job) return;
    nav.navigate("ReviewBreakdown", { jobId: job.id });
  }, [nav, job]);

  const onAccept = useCallback(async () => {
    if (!job) return;
    try {
      const b = await acceptJob(job.id);
      Alert.alert(
        "Accepted",
        `Please fund: ${formatGBPCents(b.total)}\nUse your funding instructions.`,
      );
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to accept.");
    }
  }, [job, load]);

  const onDecline = useCallback(async () => {
    if (!job) return;
    try {
      setDeclining(true);
      await declineJobWithReason(job.id, declineText);
      setDeclineText("");
      setDeclineOpen(false);
      Alert.alert(
        "Declined",
        "The trader has been notified and can reply here.",
      );
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to decline.");
    } finally {
      setDeclining(false);
    }
  }, [job, declineText, load]);

  const confirmStartFor = useCallback(
    async (who: "trader" | "client") => {
      if (!job) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { count: beforePhotoCount, error: beforePhotoError } =
        await supabase
          .from("job_photos")
          .select("id", { count: "exact", head: true })
          .eq("job_id", job.id)
          .eq("stage", "before");
      if (beforePhotoError) {
        Alert.alert("Could not check photos", beforePhotoError.message);
        return;
      }
      if (!beforePhotoCount) {
        Alert.alert(
          "Waiting for before photos",
          "Trader or client must upload at least one before photo. Once a before photo is there, the other person can approve it by confirming the job start.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Upload before photo",
              onPress: () =>
                nav.navigate("JobImages", { jobId: job.id }),
            },
          ],
        );
        return;
      }

      const today = todayYMD();

      if (who === "trader") {
        const planned = job.planned_start_date;
        const flex = Number(job.flex_days || 0);
        if (!planned) {
          Alert.alert(
            "No planned start",
            "Please set a planned start date on this job.",
          );
          return;
        }
        const diff = absDiffDays(planned, today);
        if (diff > flex) {
          Alert.alert(
            "Outside start window",
            `This is ${diff} days away from the planned start. Window is ±${flex} days.`,
          );
          return;
        }
        Alert.alert(
          "Before you start",
          "Tip: take clear “before” photos now in case of a dispute later.",
        );
      }

      const { error } = await supabase.rpc("rpc_confirm_job_start", {
        p_job_id: job.id,
        p_who: who,
      });
      if (error) {
        Alert.alert("Error confirming start", error.message);
        return;
      }

      await supabase.from("messages").insert({
        job_id: job.id,
        sender_id: user.id,
        body:
          who === "trader"
            ? "Trader confirmed job start."
            : "Client confirmed job start.",
      });

      const { data: refreshed } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", job.id)
        .single();
      const both = !!refreshed?.started_trader && !!refreshed?.started_client;

      if (both) {
        const actualStart = today;
        const newEnd = addDaysISO(
          actualStart,
          Math.max(1, Number(refreshed.duration_days || 1)) - 1,
        );

        const { error: finalErr } = await supabase
          .from("jobs")
          .update({
            start_date: actualStart,
            end_date: newEnd,
            status: "in_progress",
          })
          .eq("id", job.id);

        if (finalErr) {
          Alert.alert("Error", finalErr.message);
          return;
        }

        await supabase.from("messages").insert({
          job_id: job.id,
          sender_id: user.id,
          body: `Job started • ${isoToDMY(actualStart)} → ${isoToDMY(newEnd)}.`,
        });
      }

      await load();
    },
    [job, load, nav],
  );

  const onMarkDoneTrader = useCallback(async () => {
    if (!job) return;
    try {
      if (!me?.id) throw new Error("Please sign in again.");
      if (!(await hasJobPhotoStage(job.id, me.id, "after"))) {
        Alert.alert("Add completed photos", "Upload at least one photo of the finished work before marking the job complete.", [
          { text: "Cancel", style: "cancel" },
          { text: "Upload completed photo", onPress: () => nav.navigate("JobImages", { jobId: job.id, intent: "completion" }) },
        ]);
        return;
      }
      await sellerMarksDone(job.id);
      await supabase.from("messages").insert({
        job_id: job.id,
        sender_id: me?.id,
        body: "Trader marked the job done. Please confirm if completed.",
      });
      await load();
      nav.navigate("CompletionSuccess", { jobId: job.id, role: "trader" });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to mark done.");
    }
  }, [job, load, me?.id, nav]);

  const onMarkCompleteClient = useCallback(async () => {
    if (!job) return;
    try {
      await supabase.from("messages").insert({
        job_id: job.id,
        sender_id: me?.id,
        body: "Client marked job completed. This chat is now closed (client can send one final request).",
      });

      const payoutResult = await invokeEdgeFunction("payout", {
        jobId: job.id,
      });

      await load();
      nav.navigate("CompletionSuccess", {
        jobId: job.id,
        role: "client",
        payoutPending: !!payoutResult?.payoutPending,
        message: payoutResult?.message,
      });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to complete.");
    }
  }, [job, load, me?.id]);

  const onSubmitNotDone = useCallback(async () => {
    if (!job) return;
    try {
      setSubmittingNotDone(true);
      await clientNotDone(job.id, notDoneText);
      setNotDoneText("");
      setNotDoneOpen(false);
      Alert.alert("Dispute", "We’ve been notified by email with your note.");
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit.");
    } finally {
      setSubmittingNotDone(false);
    }
  }, [job, notDoneText, load]);

  const canChat = !!job?.client_id;
  const hasStarted = !!job?.start_date;

  const actionState = useMemo(() => {
    if (!job) return {};
    const needsPayment =
      isClient && (job.status === "accepted" || job.status === "proposed");
    const canShare = isTrader && !canChat && !!job.ref_code;
    const canMessage = canChat;

    const canStartTrader =
      !job.scope_change_status &&
      isTrader &&
      !hasStarted &&
      job.status === "funded";
    const canConfirmStartClient =
      !job.scope_change_status &&
      isClient &&
      !hasStarted &&
      !!job.started_trader &&
      job.status === "funded";

    const canMarkDoneTrader =
      !job.scope_change_status &&
      isTrader &&
      hasStarted &&
      job.status === "in_progress";
    const canMarkCompleteClient =
      !job.scope_change_status &&
      isClient &&
      hasStarted &&
      job.status === "seller_done";

    const canNotCompleted = isClient && job.status === "seller_done";
    const canRequestPartialPayment =
      !job.scope_change_status &&
      isTrader &&
      (job.duration_days > 28 || paymentBreakdown.upfrontMaterialsCents > 0) &&
      ["funded", "in_progress"].includes(job.status);
    const canReviewPartialPayment =
      !job.scope_change_status &&
      isClient &&
      partialRequests.some((request) => request.status === "requested");

    return {
      needsPayment,
      canShare,
      canMessage,
      canStartTrader,
      canConfirmStartClient,
      canMarkDoneTrader,
      canMarkCompleteClient,
      canNotCompleted,
      canRequestPartialPayment,
      canReviewPartialPayment,
    };
  }, [
    job,
    isClient,
    isTrader,
    canChat,
    hasStarted,
    partialRequests,
    paymentBreakdown.upfrontMaterialsCents,
  ]);

  const addItem = useCallback(() => {
    if (!job) return;
    const qty = Math.max(1, Number(newItemQty || 1) || 1);
    const cents = moneyToCents(newItemPrice);
    if (!newItemTitle.trim()) {
      Alert.alert("Missing", "Add an item title.");
      return;
    }
    if (cents === null) {
      Alert.alert("Invalid price", "Use something like 50 or 50.00");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        job_id: job.id,
        title: newItemTitle.trim(),
        qty,
        price_cents: cents,
      },
    ]);
    setNewItemTitle("");
    setNewItemQty("1");
    setNewItemPrice("");
  }, [job, newItemTitle, newItemQty, newItemPrice]);

  const removeItemAt = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const saveBreakdown = useCallback(async () => {
    if (!job) return;

    if (!["proposed", "accepted"].includes(job.status)) return;

    if (itemsLoadMode !== "table") {
      Alert.alert(
        "Breakdown saving not ready",
        "You don’t have a job_items table yet (or it’s blocked by RLS). Next step: I’ll give you the SQL to create it + policies, then this Save button will work.",
      );
      return;
    }

    try {
      // delete existing then insert fresh (simple + reliable)
      const { error: delErr } = await supabase
        .from("job_items")
        .delete()
        .eq("job_id", job.id);
      if (delErr) throw delErr;

      const payload = items.map((it) => ({
        job_id: job.id,
        title: it.title,
        description: it.description ?? null,
        notes: it.notes ?? null,
        qty: it.qty,
        price_cents: it.price_cents,
      }));

      const { error: insErr } = await supabase
        .from("job_items")
        .insert(payload);
      if (insErr) throw insErr;

      if (job.client_id) {
        await supabase.from("messages").insert({
          job_id: job.id,
          sender_id: me?.id,
          body: "Job breakdown updated. Please review the changes in Yakka.",
        });
      }

      Alert.alert(
        "Updated",
        "The revised breakdown is ready for the customer to review.",
      );
      setEditMode(false);
      await load();
    } catch (e: any) {
      Alert.alert("Error saving", e.message || "Could not save breakdown.");
    }
  }, [job, items, itemsLoadMode, load]);

  if (loading || !job) {
    return (
      <View
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
      >
        <ResponsivePageScrollView contentContainerStyle={styles.loadingPage}>
          <BrandScreenHeader title="Job details" onBack={() => nav.goBack()} />
          <View style={styles.loadingState}>
            <ScreenState loading title="Loading job details" />
          </View>
        </ResponsivePageScrollView>
      </View>
    );
  }

  const flex = Number(job.flex_days ?? 0);
  const customerStatusMeta = isClient
    ? getCustomerStatusMeta(job, theme.dark)
    : null;
  const traderStatusMeta = isTrader
    ? getTraderStatusMeta(job, theme.dark)
    : null;
  const activeStatusMeta = customerStatusMeta || traderStatusMeta;
  const statusCopy = getJobStatusCopy(job, isTrader ? "trader" : "client");
  const panelColor = theme.colors.surfaceVariant;
  const cardColor = theme.colors.surface;
  const quietButton = theme.colors.secondaryContainer;
  const mutedText = theme.colors.onSurfaceVariant;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ResponsivePageScrollView contentContainerStyle={styles.page}>
        <BrandScreenHeader
          title="Job details"
          onBack={() => nav.goBack()}
          chipLabel={statusLabel[job.status]}
        />

        <View style={styles.jobHeading}>
          <Text variant="headlineMedium" style={{ color: BRAND_COLORS.maroon }}>
            {job.title}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: mutedText, ...BRAND_TYPOGRAPHY.jobCode }}
          >
            Job {job.ref_code || job.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
        {/* Job overview */}
        <Card
          mode="contained"
          style={[styles.sectionCard, { backgroundColor: cardColor }]}
        >
          <Card.Title
            title="Job overview"
            titleVariant="headlineSmall"
            titleStyle={{ color: theme.colors.onSurface }}
          />
          <Card.Content style={styles.cardContent}>
            {!!job.description && (
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurface }}
              >
                {job.description}
              </Text>
            )}

            <Divider />

            <View style={styles.metaList}>
              <View style={styles.metaRow}>
                <Text variant="bodyMedium" style={{ color: mutedText }}>
                  Reference
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{
                    color: theme.colors.onSurface,
                    ...BRAND_TYPOGRAPHY.jobCode,
                  }}
                >
                  {job.ref_code || "—"}
                </Text>
              </View>
              {job.planned_start_date && (
                <View style={styles.metaRow}>
                  <Text variant="bodyMedium" style={{ color: mutedText }}>
                    Planned start
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {isoToDMY(job.planned_start_date)} (±{flex} days)
                  </Text>
                </View>
              )}
              {!!job.start_date && !!job.end_date && (
                <View style={styles.metaRow}>
                  <Text variant="bodyMedium" style={{ color: mutedText }}>
                    Actual dates
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {isoToDMY(job.start_date)} – {isoToDMY(job.end_date)}
                  </Text>
                </View>
              )}
              <View style={styles.metaRow}>
                <Text variant="bodyMedium" style={{ color: mutedText }}>
                  Duration
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurface }}
                >
                  {job.duration_days} day{job.duration_days === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <JobScopeChanges
          job={job}
          isTrader={isTrader}
          isClient={isClient}
          onChanged={load}
        />

        {/* Breakdown */}
        <Card
          mode="contained"
          style={[styles.sectionCard, { backgroundColor: cardColor }]}
        >
          <Card.Title
            title="Job breakdown"
            titleVariant="headlineSmall"
            titleStyle={{ color: theme.colors.onSurface }}
            right={() =>
              isTrader && ["proposed", "accepted"].includes(job.status) ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginRight: 6,
                  }}
                >
                  <Button
                    mode={editMode ? "contained" : "contained-tonal"}
                    onPress={() => setEditMode((v) => !v)}
                    compact
                  >
                    {editMode ? "Editing" : "Edit"}
                  </Button>
                </View>
              ) : null
            }
          />
          <Card.Content style={styles.cardContent}>
            <Text variant="bodyMedium" style={{ color: mutedText }}>
              {itemsLoadMode === "table"
                ? "Itemised breakdown"
                : "Itemised breakdown table not set up yet — showing a single line item for now."}
            </Text>

            <View style={{ gap: BRAND_SPACING.sm }}>
              {items.map((it, idx) => {
                const line = Math.max(0, it.qty) * Math.max(0, it.price_cents);
                return (
                  <View
                    key={it.id ?? `${it.title}-${idx}`}
                    style={[
                      styles.breakdownRow,
                      {
                        borderColor: theme.colors.outlineVariant,
                        backgroundColor: theme.colors.background,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.taskNumber,
                        { backgroundColor: theme.colors.secondaryContainer },
                      ]}
                    >
                      <Text
                        variant="labelSmall"
                        style={[
                          styles.taskNumberText,
                          { color: theme.colors.onSecondaryContainer },
                        ]}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        variant="titleMedium"
                        style={{ color: theme.colors.onSurface }}
                      >
                        {it.title}
                      </Text>
                      <Text variant="bodySmall" style={{ color: mutedText }}>
                        Qty {it.qty} • {formatGBPCents(it.price_cents)} each
                      </Text>
                      {!!it.description && (
                        <Text variant="bodyMedium" style={{ color: mutedText }}>
                          {it.description}
                        </Text>
                      )}
                      {!!it.notes && (
                        <Text variant="bodyMedium" style={{ color: mutedText }}>
                          Notes: {it.notes}
                        </Text>
                      )}
                    </View>
                    <Text
                      variant="titleMedium"
                      style={{
                        color: theme.colors.onSurface,
                        alignSelf: "flex-start",
                      }}
                    >
                      {formatGBPCents(line)}
                    </Text>

                    {editMode && isTrader && (
                      <IconButton
                        icon="close"
                        onPress={() => removeItemAt(idx)}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            {editMode && isTrader && (
              <View style={{ gap: 10, marginTop: 6 }}>
                <Divider />

                <Text variant="titleSmall" style={{}}>
                  Add item
                </Text>

                <TextInput
                  mode="outlined"
                  label="Item title"
                  value={newItemTitle}
                  onChangeText={setNewItemTitle}
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ width: 110 }}>
                    <TextInput
                      mode="outlined"
                      label="Qty"
                      keyboardType="number-pad"
                      value={newItemQty}
                      onChangeText={(t) =>
                        setNewItemQty(t.replace(/[^\d]/g, ""))
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      mode="outlined"
                      label="Price (GBP)"
                      keyboardType="decimal-pad"
                      value={newItemPrice}
                      onChangeText={setNewItemPrice}
                    />
                  </View>
                </View>

                <Button mode="contained-tonal" icon="plus" onPress={addItem}>
                  Add to breakdown
                </Button>

                <Button
                  mode="contained"
                  icon="content-save-outline"
                  onPress={saveBreakdown}
                >
                  Update and send to customer
                </Button>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Totals */}
        <Card
          mode="contained"
          style={[styles.sectionCard, { backgroundColor: panelColor }]}
        >
          <Card.Title
            title="Original quote"
            titleVariant="headlineSmall"
            titleStyle={{ color: theme.colors.onSurface }}
          />
          <Card.Content style={styles.cardContent}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: BRAND_SPACING.lg,
              }}
            >
              <Text
                variant="bodyMedium"
                style={{ color: mutedText, flex: 1, flexShrink: 1 }}
              >
                Tasks subtotal (ex VAT)
              </Text>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface }}
              >
                {formatGBPCents(paymentBreakdown.laborCents)}
              </Text>
            </View>

            {paymentBreakdown.materialsCents > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: BRAND_SPACING.lg,
                }}
              >
                <Text
                  variant="bodyMedium"
                  style={{ color: mutedText, flex: 1, flexShrink: 1 }}
                >
                  Materials (ex VAT)
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onSurface }}
                >
                  {formatGBPCents(paymentBreakdown.materialsCents)}
                </Text>
              </View>
            )}

            {paymentBreakdown.vatCents > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: BRAND_SPACING.lg,
                }}
              >
                <Text
                  variant="bodyMedium"
                  style={{ color: mutedText, flex: 1, flexShrink: 1 }}
                >
                  VAT (20%)
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onSurface }}
                >
                  {formatGBPCents(paymentBreakdown.vatCents)}
                </Text>
              </View>
            )}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: BRAND_SPACING.lg,
              }}
            >
              <Text
                variant="bodyMedium"
                style={{ color: mutedText, flex: 1, flexShrink: 1 }}
              >
                Customer service fee (2%)
              </Text>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface }}
              >
                {formatGBPCents(paymentBreakdown.clientFeeCents)}
              </Text>
            </View>

            {isTrader && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: BRAND_SPACING.lg,
                }}
              >
                <Text variant="bodyMedium" style={{ color: mutedText }}>
                  Tradie fee (5%)
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onSurface }}
                >
                  {formatGBPCents(paymentBreakdown.sellerFeeCents)}
                </Text>
              </View>
            )}

            {isTrader && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: BRAND_SPACING.lg,
                }}
              >
                <Text variant="bodyMedium" style={{ color: mutedText }}>
                  Net to you
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onSurface }}
                >
                  {formatGBPCents(paymentBreakdown.netToSellerCents)}
                </Text>
              </View>
            )}

            <Divider />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: BRAND_SPACING.lg,
              }}
            >
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface }}
              >
                Original customer total
              </Text>
              <Text
                variant="headlineSmall"
                style={{ color: theme.colors.onSurface }}
              >
                {formatGBPCents(paymentBreakdown.totalDueCents)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {!!partialRequests.length && (
          <Card
            mode="contained"
            style={[styles.sectionCard, { backgroundColor: cardColor }]}
          >
            <Card.Title
              title="Partial payments"
              titleVariant="headlineSmall"
              titleStyle={{ color: theme.colors.onSurface }}
            />
            <Card.Content style={styles.cardContent}>
              {partialRequests.map((request) => (
                <View
                  key={request.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="titleMedium"
                      style={{ color: theme.colors.onSurface }}
                    >
                      {formatGBPCents(request.amount_cents)}
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={{ opacity: 0.7 }}
                      numberOfLines={2}
                    >
                      {request.reason}
                    </Text>
                  </View>
                  <Chip compact>{request.status.replace("_", " ")}</Chip>
                </View>
              ))}
              {actionState.canReviewPartialPayment && (
                <Button
                  mode="contained"
                  icon="cash-check"
                  onPress={() =>
                    nav.navigate("PartialPaymentReview", { jobId: job.id })
                  }
                >
                  Review payment request
                </Button>
              )}
            </Card.Content>
          </Card>
        )}

        <View style={styles.timelineSection}>
          <JobProgressTimeline
            status={job.status}
            role={isTrader ? "trader" : "client"}
            title="Job timeline"
            contained
          />
          <Button
            mode="text"
            icon="timeline-clock-outline"
            onPress={() => nav.navigate("JobTimeline", { jobId: job.id })}
            textColor={theme.colors.onSurface}
          >
            View full timeline
          </Button>
        </View>

        {/* Actions */}
        <Card
          mode="contained"
          style={[styles.lastSectionCard, { backgroundColor: cardColor }]}
        >
          <Card.Title
            title="Next steps"
            titleVariant="headlineSmall"
            titleStyle={{ color: theme.colors.onSurface }}
          />
          <Card.Content style={styles.actionList}>
            {actionState.needsPayment && (
              <Button
                mode="contained"
                icon="credit-card-outline"
                onPress={onPayNow}
              >
                Pay now
              </Button>
            )}

            {isClient && job.status === "proposed" && (
              <>
                <Button
                  mode="contained"
                  icon="check-circle-outline"
                  onPress={onAccept}
                >
                  Accept proposal
                </Button>
                <Button mode="text" onPress={() => setDeclineOpen(true)}>
                  Decline
                </Button>
              </>
            )}

            {actionState.canStartTrader && (
              <Button
                mode="contained"
                icon="play-circle-outline"
                onPress={() => confirmStartFor("trader")}
              >
                Start job
              </Button>
            )}

            {actionState.canConfirmStartClient && (
              <Button
                mode="contained"
                icon="play-circle-outline"
                onPress={() => confirmStartFor("client")}
              >
                Confirm job started
              </Button>
            )}

            {actionState.canMarkDoneTrader && (
              <Button
                mode="contained"
                icon="check-decagram-outline"
                onPress={onMarkDoneTrader}
              >
                Mark job complete
              </Button>
            )}

            {(isTrader || isClient) && (
              <Button
                mode="contained-tonal"
                icon="image-plus"
                onPress={() =>
                  nav.navigate("JobImages", { jobId: job.id })
                }
              >
                Upload images
              </Button>
            )}

            {job.status === "completed" && (
              <Button
                mode="contained-tonal"
                icon="receipt"
                onPress={() =>
                  nav.navigate("ReceiptSummary", { jobId: job.id })
                }
              >
                Payment summary
              </Button>
            )}

            {actionState.canRequestPartialPayment && (
              <Button
                mode="contained-tonal"
                icon="cash-clock"
                onPress={() =>
                  nav.navigate("PartialPaymentRequest", { jobId: job.id })
                }
              >
                Request partial payment
              </Button>
            )}

            {actionState.canReviewPartialPayment && (
              <Button
                mode="contained"
                icon="cash-check"
                onPress={() =>
                  nav.navigate("PartialPaymentReview", { jobId: job.id })
                }
              >
                Review partial payment
              </Button>
            )}

            {actionState.canMarkCompleteClient && (
              <Button
                mode="contained"
                icon="check-decagram-outline"
                onPress={onMarkCompleteClient}
              >
                Mark job complete
              </Button>
            )}

            {actionState.canNotCompleted && (
              <Button
                mode="contained-tonal"
                icon="alert-circle-outline"
                onPress={() => nav.navigate("Dispute", { jobId: job.id })}
              >
                Not completed
              </Button>
            )}

            {(job.status === "disputed" || job.status === "seller_done") && (
              <Button
                mode="text"
                icon="headset"
                onPress={() =>
                  nav.navigate("ContactUs", {
                    jobId: job.id,
                    subject: `Job ${job.ref_code || job.id} support`,
                  })
                }
              >
                Contact Yakka
              </Button>
            )}

            {job.status === "disputed" && (
              <Button
                mode="contained-tonal"
                icon="file-search-outline"
                onPress={() =>
                  nav.navigate("DisputeOutcome", { jobId: job.id })
                }
              >
                View dispute
              </Button>
            )}
          </Card.Content>
        </Card>
      </ResponsivePageScrollView>

      <BottomCurtain
        visible={statusInfoOpen}
        onDismiss={() => setStatusInfoOpen(false)}
        title={
          isTrader && traderStatusMeta
            ? traderStatusMeta.bannerLabel
            : `Status: ${statusLabel[job.status]}`
        }
      >
        <View>
          <Text variant="bodyMedium" style={{ marginBottom: 10 }}>
            {statusCopy.what}
          </Text>
          {!!statusCopy.tip && (
            <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
              Tip: {statusCopy.tip}
            </Text>
          )}
        </View>
      </BottomCurtain>

      <BottomCurtain
        visible={declineOpen}
        onDismiss={() => setDeclineOpen(false)}
        title="Decline job"
      >
        <View style={{ gap: 12 }}>
          <TextInput
            mode="outlined"
            placeholder="Reason (e.g., not what we agreed)"
            value={declineText}
            onChangeText={setDeclineText}
            multiline
          />
          <View
            style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}
          >
            <Button onPress={() => setDeclineOpen(false)} disabled={declining}>
              Cancel
            </Button>
            <Button mode="contained" onPress={onDecline} loading={declining}>
              Decline
            </Button>
          </View>
        </View>
      </BottomCurtain>

      <BottomCurtain
        visible={notDoneOpen}
        onDismiss={() => setNotDoneOpen(false)}
        title="Not completed"
      >
        <View style={{ gap: 12 }}>
          <TextInput
            mode="outlined"
            placeholder="Explain what’s missing"
            value={notDoneText}
            onChangeText={setNotDoneText}
            multiline
          />
          <View
            style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}
          >
            <Button
              onPress={() => setNotDoneOpen(false)}
              disabled={submittingNotDone}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={onSubmitNotDone}
              loading={submittingNotDone}
            >
              Submit
            </Button>
          </View>
        </View>
      </BottomCurtain>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  page: {
    paddingBottom: 48,
  },
  loadingPage: {
    flexGrow: 1,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  jobHeading: {
    paddingTop: BRAND_SPACING.lg,
    paddingBottom: BRAND_SPACING.lg,
    gap: BRAND_SPACING.sm,
  },
  sectionCard: {
    borderRadius: BRAND_RADII.panel,
    marginBottom: BRAND_SPACING.lg,
  },
  lastSectionCard: {
    borderRadius: BRAND_RADII.panel,
  },
  statusContent: {
    gap: BRAND_SPACING.lg,
    paddingVertical: BRAND_SPACING.lg,
  },
  statusHero: {
    borderWidth: 1,
    overflow: "hidden",
  },
  statusHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: BRAND_SPACING.sm,
  },
  statusMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusHelpButton: {
    alignSelf: "flex-start",
  },
  statusBanner: {
    borderWidth: 1,
    borderRadius: BRAND_RADII.control,
    paddingHorizontal: BRAND_SPACING.md,
    paddingVertical: 10,
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: BRAND_SPACING.sm,
    marginBottom: BRAND_SPACING.lg,
  },
  quickAction: {
    flexBasis: "45%",
    flexGrow: 1,
    minWidth: 132,
  },
  actionButtonContent: {
    minHeight: 50,
  },
  cardContent: {
    gap: BRAND_SPACING.sm,
    paddingBottom: BRAND_SPACING.lg,
  },
  metaList: {
    gap: BRAND_SPACING.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: BRAND_SPACING.lg,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: BRAND_SPACING.sm,
    paddingHorizontal: BRAND_SPACING.md,
    paddingVertical: BRAND_SPACING.md,
    borderRadius: BRAND_RADII.control,
    borderWidth: 1,
  },
  taskNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND_COLORS.orangeSoft,
    alignSelf: "flex-start",
  },
  taskNumberText: {
    color: BRAND_COLORS.maroon,
    fontFamily: "Satoshi-Bold",
  },
  timelineSection: {
    gap: BRAND_SPACING.xs,
    marginBottom: BRAND_SPACING.lg,
  },
  actionList: {
    gap: BRAND_SPACING.sm,
    paddingBottom: BRAND_SPACING.lg,
  },
});
