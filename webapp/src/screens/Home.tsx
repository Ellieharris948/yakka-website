import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Share,
  useWindowDimensions,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import MCIcon from '../components/BrandIcon';
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
import { ensureMyProfile } from "../api/profile";
import { declineJobWithReason, sellerMarksDone } from "../api/jobs";
import {
  BRAND_BUTTON_METRICS,
  BRAND_COLORS,
  BRAND_GRADIENT,
  BRAND_RADII,
  BRAND_TYPOGRAPHY,
} from "../theme";
import { getJobStatusCopy } from "../utils/jobStatusCopy";
import { buildJobPaymentBreakdown } from "../utils/jobPayments";
import { formatGBPCents } from "../utils/money";
import { hasJobPhotoStage } from "../utils/jobImages";
import {
  getCustomerStatusMeta,
  getJobStatusMeta,
  getTraderStatusMeta,
} from "../utils/statusStyles";
import { invokeEdgeFunction } from "../utils/edgeFunctions";
import { isPastJobForViewer } from "../utils/jobVisibility";
import BrandScreenFrame from "../components/BrandScreenFrame";
import ShareJobSheet from "../components/ShareJobSheet";
import { buildCustomerJobShare } from "../utils/jobShare";
import BottomCurtain from "../components/BottomCurtain";
import SwipeSegmentedControl from "../components/SwipeSegmentedControl";
import FlowCurtain from "../components/FlowCurtain";
import CreateJobScreen from "./CreateJob";
import ClientCreateJobScreen from "./ClientCreateJob";
import {
  getResponsiveControlHeight,
  getResponsiveLayoutValue,
  getResponsiveScreenGutter,
} from "../utils/layout";
import ScreenState from "../components/ScreenState";

const HOME_JOB_OPTIONS = [
  { value: "active", label: "Live jobs" },
  { value: "past", label: "Past jobs" },
] as const;

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

type NotificationMessage = {
  id: string;
  job_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
};

function CreateJobAction({ onPress }: { onPress: () => void }) {
  const { width } = useWindowDimensions();
  const iconBoxSize = getResponsiveLayoutValue(32, width);
  const controlHeight = getResponsiveControlHeight(width);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create a new job"
      onPress={onPress}
      style={({ pressed }) => ({
        width: "100%",
        minHeight: controlHeight,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: BRAND_BUTTON_METRICS.iconTextGap,
        backgroundColor: BRAND_COLORS.orange,
        borderRadius: BRAND_RADII.control,
        paddingHorizontal: getResponsiveLayoutValue(
          BRAND_BUTTON_METRICS.leadingIconInset,
          width,
        ),
        opacity: pressed ? 0.86 : 1,
        shadowColor: "#581a1f",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
      })}
    >
      <View
        style={{
          width: iconBoxSize,
          height: iconBoxSize,
          borderRadius: getResponsiveLayoutValue(9, width),
          backgroundColor: BRAND_COLORS.white,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MCIcon
          name="plus"
          size={getResponsiveLayoutValue(22, width)}
          color={BRAND_COLORS.orange}
        />
      </View>
      <Text
        variant="titleMedium"
        style={{ color: BRAND_COLORS.white, flex: 1 }}
      >
        Create a job
      </Text>
      <MCIcon
        name="arrow-right"
        size={getResponsiveLayoutValue(20, width)}
        color={BRAND_COLORS.white}
      />
    </Pressable>
  );
}

function EnterJobCodeAction({ onPress }: { onPress: () => void }) {
  const { width } = useWindowDimensions();
  const controlHeight = getResponsiveControlHeight(width);

  return (
    <Button
      mode="contained"
      icon="ticket-confirmation-outline"
      onPress={onPress}
      buttonColor={BRAND_COLORS.stoneSoft}
      textColor={BRAND_COLORS.maroon}
      style={{
        width: "100%",
        minHeight: controlHeight,
        borderRadius: BRAND_RADII.control,
        shadowColor: "#581a1f",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
        elevation: 5,
      }}
      contentStyle={{
        minHeight: controlHeight,
        alignItems: "center",
        justifyContent: "center",
      }}
      labelStyle={{ marginVertical: 0 }}
    >
      Enter a job code
    </Button>
  );
}

function daysBetween(sd?: string | null, ed?: string | null) {
  if (!sd || !ed) return 0;
  const d1 = new Date(sd + "T00:00:00");
  const d2 = new Date(ed + "T00:00:00");
  const ms = d2.getTime() - d1.getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

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

function formatCount(count: number, singular: string, plural?: string) {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural || `${singular}s`}`;
}

function readStructuredJobField(
  description?: string | null,
  labels: string[] = [],
) {
  const source = String(description || "");
  for (const label of labels) {
    const match = source.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function formatCompactCardDate(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "numeric",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatNotificationTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function Home() {
  const theme = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(viewportWidth);
  const quietButton = theme.dark
    ? theme.colors.surfaceVariant
    : BRAND_COLORS.orangeSoft;
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  const [me, setMe] = useState<any>(null);
  const [isTrader, setIsTrader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refCode, setRefCode] = useState("");
  const [showJobCodeEntry, setShowJobCodeEntry] = useState(false);
  const [declineForId, setDeclineForId] = useState<string | null>(null);
  const [declineText, setDeclineText] = useState("");
  const [declining, setDeclining] = useState(false);
  const [jobFilter, setJobFilter] = useState<"active" | "past">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<
    "all" | "awaiting_customer" | "in_progress"
  >("all");
  const [statusInfoFor, setStatusInfoFor] = useState<Job | null>(null);
  const [customerShareJob, setCustomerShareJob] = useState<Job | null>(null);
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const [customerHowItWorksOpen, setCustomerHowItWorksOpen] = useState(false);
  const [traderCreateOpen, setTraderCreateOpen] = useState(false);
  const [clientCreateOpen, setClientCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [jobsSheetExpanded, setJobsSheetExpanded] = useState(false);
  const [homeActionsHeight, setHomeActionsHeight] = useState(0);
  const [partialStatusByJob, setPartialStatusByJob] = useState<
    Record<string, string>
  >({});
  const [notificationMessages, setNotificationMessages] = useState<
    NotificationMessage[]
  >([]);
  const [notificationsSeenAt, setNotificationsSeenAt] = useState<string | null>(
    null,
  );
  const [notificationsClearedAt, setNotificationsClearedAt] = useState<string | null>(null);
  const notificationsSeenLoaded = useRef(false);
  const bellMotion = useRef(new Animated.Value(0)).current;

  const loadJobs = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .or(`trader_id.eq.${user.id},client_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    setJobs((data || []) as Job[]);
    const jobIds = (data || []).map((job: any) => job.id);
    if (jobIds.length) {
      const [partialResult, messageResult] = await Promise.all([
        supabase
          .from("partial_payment_requests")
          .select("job_id,status,created_at")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("messages")
          .select("id,job_id,sender_id,body,created_at")
          .in("job_id", jobIds)
          .neq("sender_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
      const latest: Record<string, string> = {};
      for (const row of partialResult.data || []) {
        if (
          !latest[row.job_id] &&
          ["requested", "approved", "released"].includes(row.status)
        )
          latest[row.job_id] = row.status;
      }
      setPartialStatusByJob(latest);
      setNotificationMessages(
        (messageResult.data || []) as NotificationMessage[],
      );
    } else {
      setPartialStatusByJob({});
      setNotificationMessages([]);
    }

    if (!notificationsSeenLoaded.current) {
      notificationsSeenLoaded.current = true;
      const key = `yakka_notifications_seen_at_${user.id}`;
      const stored = await AsyncStorage.getItem(key);
      const cleared = await AsyncStorage.getItem(`yakka_notifications_cleared_at_${user.id}`);
      setNotificationsClearedAt(cleared);
      if (stored) {
        setNotificationsSeenAt(stored);
      } else {
        const now = new Date().toISOString();
        setNotificationsSeenAt(now);
        void AsyncStorage.setItem(key, now);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const profile = await ensureMyProfile();
        setMe(profile);
        setIsTrader(profile?.role === "trader");
      } catch (e: any) {
        Alert.alert(
          "Profile setup error",
          e.message || "Could not load your profile.",
        );
      }

      await loadJobs();
      setLoading(false);
    })();
  }, [loadJobs]);

  useFocusEffect(
    useCallback(() => {
      loadJobs();
    }, [loadJobs]),
  );

  useEffect(() => {
    if (!me?.id) return undefined;
    // Effects can restart before Supabase finishes removing the previous
    // channel. A unique topic prevents a restarted effect from reusing an
    // already-subscribed channel and trying to append callbacks to it.
    const channelTopic = `home-notifications-${me.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelTopic)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          void loadJobs();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs" },
        () => {
          void loadJobs();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadJobs, me?.id]);

  const unreadNotificationCount = useMemo(() => {
    if (!notificationsSeenAt) return 0;
    const seenTime = new Date(notificationsSeenAt).getTime();
    return (
      notificationMessages.filter(
        (message) => new Date(message.created_at).getTime() > seenTime,
      ).length +
      jobs.filter((job) => new Date(job.created_at).getTime() > seenTime).length
    );
  }, [jobs, notificationMessages, notificationsSeenAt]);

  const markNotificationsSeen = useCallback(() => {
    if (!me?.id) return;
    const now = new Date().toISOString();
    setNotificationsSeenAt(now);
    void AsyncStorage.setItem(`yakka_notifications_seen_at_${me.id}`, now);
  }, [me?.id]);

  const toggleNotifications = useCallback(() => {
    setNotificationsOpen((open) => {
      if (!open) markNotificationsSeen();
      return !open;
    });
  }, [markNotificationsSeen]);

  const clearNotifications = useCallback(() => {
    if (!me?.id) return;
    const now = new Date().toISOString();
    setNotificationsClearedAt(now);
    setNotificationsSeenAt(now);
    void AsyncStorage.multiSet([
      [`yakka_notifications_cleared_at_${me.id}`, now],
      [`yakka_notifications_seen_at_${me.id}`, now],
    ]);
  }, [me?.id]);

  useEffect(() => {
    if (!notificationsOpen) return;
    markNotificationsSeen();
  }, [markNotificationsSeen, notificationMessages.length, notificationsOpen]);

  useEffect(() => {
    if (!unreadNotificationCount || notificationsOpen) {
      bellMotion.stopAnimation();
      bellMotion.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(bellMotion, {
          toValue: -1,
          duration: 85,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(bellMotion, {
          toValue: 1,
          duration: 120,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(bellMotion, {
          toValue: -0.7,
          duration: 105,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(bellMotion, {
          toValue: 0.7,
          duration: 105,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(bellMotion, {
          toValue: 0,
          duration: 90,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.delay(1100),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [bellMotion, notificationsOpen, unreadNotificationCount]);

  useEffect(() => {
    let prefillRef: string | undefined = route?.params?.prefillRef;

    try {
      const parent = (nav as any).getParent?.();
      const state = parent?.getState?.();
      const main = state?.routes?.find(
        (entry: any) => entry.name === "MainTabs",
      );
      if (!prefillRef && main?.params?.prefillRef) {
        prefillRef = String(main.params.prefillRef);
      }
    } catch {}

    if (prefillRef) setRefCode(String(prefillRef).toUpperCase());
  }, [route?.params?.prefillRef, nav]);

  const viewerRole = isTrader ? "trader" : "client";
  const activeJobs = useMemo(
    () => jobs.filter((job) => !isPastJobForViewer(job, viewerRole)),
    [jobs, viewerRole],
  );
  const pastJobs = useMemo(
    () => jobs.filter((job) => isPastJobForViewer(job, viewerRole)),
    [jobs, viewerRole],
  );
  const filteredJobs = useMemo(() => {
    const scopedJobs = jobFilter === "active" ? activeJobs : pastJobs;
    const search = searchQuery.trim().toLowerCase();

    return scopedJobs.filter((job) => {
      if (quickFilter === "awaiting_customer") {
        const awaitingCustomer =
          job.status === "proposed" ||
          job.status === "seller_done" ||
          (!!isTrader && !job.client_id && !!job.ref_code);
        if (!awaitingCustomer) return false;
      }

      if (
        quickFilter === "in_progress" &&
        !["funded", "in_progress", "accepted"].includes(job.status)
      ) {
        return false;
      }

      if (!search) return true;

      const haystack = [job.title, job.ref_code || "", job.description || ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [jobFilter, activeJobs, pastJobs, searchQuery, quickFilter, isTrader]);

  const greetingCopy = isTrader
    ? "Get paid on time (every time) - without chasing customers."
    : "Pay securely - released only when the job is done right.";

  const firstName = useMemo(() => {
    const rawName = String(me?.name || "").trim();
    return rawName ? rawName.split(" ")[0] : "there";
  }, [me?.name]);
  const customerGreetingName = useMemo(() => {
    const rawName = String(me?.name || "").trim();
    return rawName || "there";
  }, [me?.name]);

  const attentionCount = useMemo(() => {
    return jobs.filter((job) => {
      const hasStarted = !!job.start_date;
      if (isTrader) {
        const canShare = !job.client_id && !!job.ref_code;
        const canStart = !hasStarted && job.status === "funded";
        const canMarkDone = hasStarted && job.status === "in_progress";
        return canShare || canStart || canMarkDone;
      }
      return (
        job.status === "proposed" ||
        job.status === "accepted" ||
        job.status === "seller_done"
      );
    }).length;
  }, [jobs, isTrader]);

  const getStatusDialogCopy = useCallback(
    (job: Job) => getJobStatusCopy(job, isTrader ? "trader" : "client"),
    [isTrader],
  );

  const markTraderDone = useCallback(
    async (job: Job) => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");

        if (!(await hasJobPhotoStage(job.id, user.id, "after"))) {
          Alert.alert("Add completed photos", "Upload at least one photo of the finished work before marking the job complete.", [
            { text: "Cancel", style: "cancel" },
            { text: "Upload completed photo", onPress: () => nav.navigate("JobImages", { jobId: job.id, intent: "completion" }) },
          ]);
          return;
        }
        await sellerMarksDone(job.id);
        await supabase.from("messages").insert({
          job_id: job.id,
          sender_id: user.id,
          body: "Trader marked the job done. Please confirm if completed.",
        });

        await loadJobs();
        nav.navigate("CompletionSuccess", { jobId: job.id, role: "trader" });
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to mark the job complete.");
      }
    },
    [loadJobs, nav],
  );

  const markClientComplete = useCallback(
    async (job: Job) => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");

        await supabase.from("messages").insert({
          job_id: job.id,
          sender_id: user.id,
          body: "Client marked job completed. This chat is now closed.",
        });

        const payoutResult = await invokeEdgeFunction("payout", {
          jobId: job.id,
        });

        await loadJobs();
        nav.navigate("CompletionSuccess", {
          jobId: job.id,
          role: "client",
          payoutPending: !!payoutResult?.payoutPending,
          message: payoutResult?.message,
        });
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to complete the job.");
      }
    },
    [loadJobs, nav],
  );

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
      Alert.alert("Copy failed", "Could not access the clipboard.");
    }
  }

  function buildRefInstructions(code: string) {
    const traderName = me?.name ?? "me";
    const upper = String(code || "").toUpperCase();
    const universal = `https://yakka.app/join/${upper}`;
    const appScheme = `yakka://join/${upper}`;

    return `Hi! To book and chat with ${traderName} on Yakka:

1) Download or open Yakka
2) Sign up as a client
3) Use this link to auto-fill the code: ${universal}
   (If the app asks, the code is: ${upper})

If the link does not open the app automatically, try this: ${appScheme}

This opens our chat so I can send the proposal.`;
  }

  const doDecline = useCallback(async () => {
    if (!declineForId) return;

    try {
      setDeclining(true);
      await declineJobWithReason(declineForId, declineText);
      setDeclineText("");
      setDeclineForId(null);
      Alert.alert(
        "Declined",
        "The trader has been notified and can reply here.",
      );
      await loadJobs();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to decline the job.");
    } finally {
      setDeclining(false);
    }
  }, [declineForId, declineText, loadJobs]);

  const confirmStartFor = useCallback(
    async (job: Job, who: "trader" | "client") => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Auth", "Please sign in again.");
        return;
      }

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
            `This is ${diff} days away from the planned start. Window is +/-${flex} days.`,
          );
          return;
        }

        Alert.alert(
          "Before you start",
          "Tip: take clear before photos now in case of a dispute later.",
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
      const bothConfirmed =
        !!refreshed?.started_trader && !!refreshed?.started_client;

      if (bothConfirmed) {
        const actualStart = today;
        const newEnd = addDaysISO(
          actualStart,
          Math.max(1, Number(refreshed.duration_days || 1)) - 1,
        );

        const { error: updateError } = await supabase
          .from("jobs")
          .update({
            start_date: actualStart,
            end_date: newEnd,
            status: "in_progress",
          })
          .eq("id", job.id);

        if (updateError) {
          Alert.alert("Error", updateError.message);
          return;
        }

        await supabase.from("messages").insert({
          job_id: job.id,
          sender_id: user.id,
          body: `Job started - ${isoToDMY(actualStart)} to ${isoToDMY(newEnd)}.`,
        });
      }

      await loadJobs();
    },
    [loadJobs, nav],
  );

  function renderJobCard(item: Job) {
    const currentUserId = me?.id ? String(me.id) : null;
    const hasOtherParty = isTrader
      ? !!item.client_id && item.client_id !== currentUserId
      : !!item.trader_id && item.trader_id !== currentUserId;
    const canChat = hasOtherParty;
    const isPast = isPastJobForViewer(item, viewerRole);
    const hasStarted = !!item.start_date;
    const isClient = !isTrader;
    const needsPayment = isClient && item.status === "accepted";
    const canShareTrader = isTrader && !canChat && !!item.ref_code;
    const canShareCustomer =
      isClient &&
      !hasOtherParty &&
      item.status === "proposed" &&
      !!item.ref_code &&
      Number(item.price_cents || 0) <= 0;
    const canShare = canShareTrader || canShareCustomer;
    const canReviewPricedBreakdown =
      isClient &&
      item.status === "proposed" &&
      Number(item.price_cents || 0) > 0;
    const canConfirmStartClient =
      !item.scope_change_status &&
      isClient &&
      !hasStarted &&
      !!item.started_trader &&
      item.status === "funded";
    const canStartTrader = !item.scope_change_status && isTrader && !hasStarted && item.status === "funded";
    const canMarkDoneTrader =
      !item.scope_change_status && isTrader && hasStarted && item.status === "in_progress";
    const canMarkCompleteClient =
      !item.scope_change_status && isClient && hasStarted && item.status === "seller_done";
    const canRaiseDisputeClient =
      isClient && hasStarted && item.status === "seller_done";
    const paymentBreakdown = buildJobPaymentBreakdown(item as any);
    const awaitingTradieDetailsCard =
      isClient &&
      item.status === "proposed" &&
      Number(item.price_cents || 0) <= 0;

    const subtitle = (() => {
      if (hasStarted && item.start_date && item.end_date) {
        const totalDays = daysBetween(item.start_date, item.end_date);
        return `${formatGBPCents(item.price_cents)} - ${isoToDMY(item.start_date)} to ${isoToDMY(item.end_date)} - ${totalDays} day${totalDays === 1 ? "" : "s"}`;
      }

      const flex = Number(item.flex_days ?? 0);
      if (item.planned_start_date) {
        return `${formatGBPCents(item.price_cents)} - planned ${isoToDMY(item.planned_start_date)} (+/-${flex}) - ${item.duration_days} day${item.duration_days === 1 ? "" : "s"}`;
      }

      return `${formatGBPCents(item.price_cents)} - ${item.duration_days} day${item.duration_days === 1 ? "" : "s"}`;
    })();

    const nextStep = (() => {
      if (canShareTrader)
        return "Share this secure Yakka link with your customer so they can review and join the job.";
      if (canShareCustomer) {
        return "Share this secure Yakka link with your tradie so they can add the job details and pricing.";
      }
      if (
        isClient &&
        item.status === "proposed" &&
        Number(item.price_cents || 0) <= 0
      ) {
        return "Your tradie is still preparing the job details and pricing. You will review it here once it arrives.";
      }
      if (canReviewPricedBreakdown) {
        return "Your tradie has submitted the job breakdown. Please review the details and make payment to secure the booking.";
      }
      if (needsPayment)
        return "Your breakdown is approved. Complete payment securely in Yakka to confirm the booking.";
      if (canStartTrader)
        return "Start the job when you are within the agreed start window.";
      if (canConfirmStartClient)
        return "Review the before photos, then confirm if they are correct and the job has started.";
      if (canMarkDoneTrader)
        return "Mark the job done only when every agreed task is complete.";
      if (canMarkCompleteClient)
        return "Confirm completion if everything is finished, or raise an issue if it is not.";
      return (
        getStatusDialogCopy(item)?.what ||
        "Open the job to review the latest details."
      );
    })();

    const partialStatus = partialStatusByJob[item.id];
    const customerStatusMeta = isClient
      ? getJobStatusMeta(item, "client", {
          dark: theme.dark,
          partialPaymentStatus: partialStatus,
        })
      : null;
    const traderStatusMeta = isTrader
      ? getJobStatusMeta(item, "trader", {
          dark: theme.dark,
          partialPaymentStatus: partialStatus,
        })
      : null;

    const postcodeLabel = readStructuredJobField(item.description, [
      "Post code",
      "Postcode",
    ]);
    const addressLine1Label = readStructuredJobField(item.description, [
      "Address line 1",
    ]);
    const locationSummaryLabel = readStructuredJobField(item.description, [
      "Location",
    ]);
    const locationLabel = (() => {
      const raw =
        (item as any).postcode ||
        postcodeLabel ||
        (item as any).address_line_1 ||
        addressLine1Label ||
        (item as any).location ||
        locationSummaryLabel;
      return raw ? String(raw).trim() : null;
    })();

    const scheduleLabel =
      hasStarted && item.start_date
        ? `Start date: ${isoToDMY(item.start_date)}`
        : item.planned_start_date
          ? `Proposed start date: ${isoToDMY(item.planned_start_date)}`
          : null;
    const compactScheduleLabel = item.planned_start_date
      ? `Proposed Start Date: ${formatCompactCardDate(item.planned_start_date)}`
      : null;
    const jobTotalLabel =
      Number(item.price_cents || 0) > 0
        ? formatGBPCents(item.price_cents)
        : "To be confirmed";
    const showTraderUploadImages =
      isTrader &&
      [
        "funded",
        "in_progress",
        "seller_done",
        "client_done",
        "disputed",
      ].includes(item.status);
    const showTraderHistoryHint =
      isTrader &&
      canChat &&
      [
        "funded",
        "in_progress",
        "seller_done",
        "client_done",
        "completed",
        "disputed",
      ].includes(item.status);
    const jobCardChrome = {
      marginBottom: 12,
      borderRadius: 22,
      overflow: "hidden" as const,
      shadowColor: BRAND_COLORS.maroon,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.dark ? 0.2 : 0.07,
      shadowRadius: 10,
      elevation: 2,
    };

    const handleShareJob = async () => {
      if (!item.ref_code) {
        Alert.alert(
          "No code yet",
          "This job has not been assigned a reference code yet.",
        );
        return;
      }

      if (isClient) {
        setCustomerShareJob(item);
        return;
      }

      await copyToClipboard(buildRefInstructions(item.ref_code));
    };

    if (isTrader) {
      const awaitingBreakdown =
        item.status === "proposed" &&
        !!item.client_id &&
        Number(item.price_cents || 0) <= 0;
      const waitingForCustomerPayment =
        ["proposed", "accepted"].includes(item.status) && !awaitingBreakdown;
      const contactYakka =
        item.status === "disputed" || item.status === "client_done";

      return (
        <Card
          mode="contained"
          style={{
            ...jobCardChrome,
            backgroundColor: theme.colors.surface,
            opacity: isPast ? 0.78 : 1,
          }}
        >
          <Card.Content
            style={{ gap: 10, paddingVertical: 14, paddingHorizontal: 16 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <Text
                variant="titleLarge"
                style={{
                  color: BRAND_COLORS.maroon,
                  flex: 1,
                  ...BRAND_TYPOGRAPHY.jobCode,
                }}
              >
                Job ID: {item.ref_code || "Pending"}
              </Text>
              <IconButton
                icon="information"
                size={23}
                iconColor={BRAND_COLORS.outline}
                accessibilityLabel="About this job status"
                style={{ margin: 0 }}
                onPress={() => setStatusInfoFor(item)}
              />
            </View>

            {!!traderStatusMeta && (
              <Pressable
                onPress={() => setStatusInfoFor(item)}
                style={{
                  backgroundColor: traderStatusMeta.backgroundColor,
                  borderColor: traderStatusMeta.borderColor,
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                }}
              >
                <Text
                  variant="titleSmall"
                  style={{
                    color: traderStatusMeta.textColor,
                    textAlign: "center",
                  }}
                >
                  {traderStatusMeta.bannerLabel}
                </Text>
              </Pressable>
            )}

            <View style={{ gap: 8 }}>
              <Text
                variant="bodyLarge"
                style={{ color: BRAND_COLORS.textMuted }}
              >
                {item.title}
              </Text>
              {!!compactScheduleLabel && (
                <Text
                  variant="bodyMedium"
                  style={{ color: BRAND_COLORS.textMuted }}
                >
                  {compactScheduleLabel}
                </Text>
              )}
              {!!locationLabel && (
                <Text
                  variant="bodyMedium"
                  style={{ color: BRAND_COLORS.textMuted }}
                >
                  Location: {locationLabel}
                </Text>
              )}
              <Text
                variant="bodyMedium"
                style={{ color: BRAND_COLORS.textMuted }}
              >
                Job Total: {jobTotalLabel}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 9,
                justifyContent: "flex-end",
              }}
            >
              {awaitingBreakdown && (
                <Button
                  compact
                  mode="contained"
                  onPress={() =>
                    nav.navigate("JobRequestDetails", { jobId: item.id })
                  }
                  buttonColor={BRAND_COLORS.orange}
                  style={{ flexGrow: 1, borderRadius: 18 }}
                >
                  Input breakdown
                </Button>
              )}

              {waitingForCustomerPayment && !!item.ref_code && (
                <Button
                  compact
                  mode="contained"
                  onPress={handleShareJob}
                  buttonColor={BRAND_COLORS.orange}
                  style={{ flexGrow: 1, borderRadius: 18 }}
                >
                  Copy link
                </Button>
              )}

              {canStartTrader && (
                <Button
                  compact
                  mode="contained"
                  onPress={() => confirmStartFor(item, "trader")}
                  buttonColor={BRAND_COLORS.orange}
                  style={{ flexGrow: 1, borderRadius: 18 }}
                >
                  Start job
                </Button>
              )}

              {canMarkDoneTrader && (
                <Button
                  compact
                  mode="contained"
                  onPress={() => markTraderDone(item)}
                  buttonColor={BRAND_COLORS.orange}
                  style={{ flexGrow: 1, borderRadius: 18 }}
                >
                  Mark job complete
                </Button>
              )}

              {contactYakka && (
                <Button
                  compact
                  mode="contained"
                  onPress={() =>
                    nav.navigate("ContactUs", {
                      jobId: item.id,
                      subject: `Job ${item.ref_code || item.id} support`,
                    })
                  }
                  buttonColor={BRAND_COLORS.orange}
                  style={{ flexGrow: 1, borderRadius: 18 }}
                >
                  Contact Yakka
                </Button>
              )}

              <Button
                compact
                mode="contained"
                onPress={() => nav.navigate("JobDetails", { jobId: item.id })}
                buttonColor={quietButton}
                textColor={BRAND_COLORS.maroon}
                style={{ flexGrow: 1, borderRadius: 18 }}
              >
                View job
              </Button>
            </View>
          </Card.Content>
        </Card>
      );
    }

    if (awaitingTradieDetailsCard) {
      return (
        <Card
          mode="contained"
          style={{
            ...jobCardChrome,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Card.Content
            style={{ gap: 10, paddingVertical: 14, paddingHorizontal: 16 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  variant="titleLarge"
                  style={{
                    color: BRAND_COLORS.maroon,
                    ...BRAND_TYPOGRAPHY.jobCode,
                  }}
                >
                  Job ID:
                </Text>
                <Text
                  variant="titleLarge"
                  style={{
                    color: BRAND_COLORS.maroon,
                    ...BRAND_TYPOGRAPHY.jobCode,
                  }}
                >
                  {item.ref_code || "Pending"}
                </Text>
              </View>

              <Button
                compact
                mode="text"
                icon="information-outline"
                onPress={() => setStatusInfoFor(item)}
                textColor={BRAND_COLORS.maroon}
              >
                Info
              </Button>
            </View>

            {!!customerStatusMeta && (
              <View
                style={{
                  backgroundColor: customerStatusMeta.backgroundColor,
                  borderColor: customerStatusMeta.borderColor,
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text
                  variant="titleSmall"
                  style={{ color: customerStatusMeta.textColor }}
                >
                  {customerStatusMeta.bannerLabel}
                </Text>
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Text
                variant="bodyLarge"
                style={{ color: BRAND_COLORS.textMuted }}
              >
                {item.title}
              </Text>
              {!!compactScheduleLabel && (
                <Text
                  variant="bodyMedium"
                  style={{ color: BRAND_COLORS.textMuted }}
                >
                  {compactScheduleLabel}
                </Text>
              )}
              {!!locationLabel && (
                <Text
                  variant="bodyMedium"
                  style={{ color: BRAND_COLORS.textMuted }}
                >
                  Location: {locationLabel}
                </Text>
              )}
            </View>

            <View
              style={{
                flexDirection: "column",
                gap: 8,
              }}
            >
              {canShare && (
                <Button
                  mode="contained"
                  onPress={handleShareJob}
                  buttonColor={theme.colors.secondary}
                  textColor={theme.colors.onSecondary}
                  style={{
                    width: "100%",
                    borderRadius: 18,
                  }}
                  labelStyle={{}}
                >
                  Share job
                </Button>
              )}

              <Button
                mode="contained"
                onPress={() => nav.navigate("JobDetails", { jobId: item.id })}
                buttonColor={quietButton}
                textColor={BRAND_COLORS.maroon}
                style={{
                  width: "100%",
                  borderRadius: 18,
                }}
                labelStyle={{}}
              >
                View job
              </Button>
            </View>
          </Card.Content>
        </Card>
      );
    }

    return (
      <Card
        mode="contained"
        style={{
          ...jobCardChrome,
          backgroundColor: theme.colors.surface,
          opacity: isPast ? 0.72 : 1,
        }}
      >
        <Card.Content
          style={{ gap: 10, paddingVertical: 14, paddingHorizontal: 16 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: isClient ? 2 : 4 }}>
              {isClient ? (
                <>
                  <Text
                    variant="titleLarge"
                    style={{
                      color: BRAND_COLORS.maroon,
                      ...BRAND_TYPOGRAPHY.jobCode,
                    }}
                  >
                    Job ID: {item.ref_code || "Pending"}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {item.title}
                  </Text>
                </>
              ) : (
                <>
                  <Text variant="titleMedium" style={{}}>
                    {item.title}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      lineHeight: 20,
                      ...BRAND_TYPOGRAPHY.jobCode,
                    }}
                  >
                    Job ID: {item.ref_code || "Pending"}
                  </Text>
                </>
              )}
            </View>

            {isClient ? (
              <Button
                compact
                mode="text"
                icon="information-outline"
                onPress={() => setStatusInfoFor(item)}
                textColor={BRAND_COLORS.maroon}
              >
                Help
              </Button>
            ) : (
              <Button
                compact
                mode="text"
                icon="information-outline"
                onPress={() => setStatusInfoFor(item)}
              >
                Info
              </Button>
            )}
          </View>

          {isClient && customerStatusMeta ? (
            <View
              style={{
                backgroundColor: customerStatusMeta.backgroundColor,
                borderColor: customerStatusMeta.borderColor,
                borderWidth: 1,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                variant="titleSmall"
                style={{ color: customerStatusMeta.textColor }}
              >
                {customerStatusMeta.bannerLabel}
              </Text>
            </View>
          ) : traderStatusMeta ? (
            <View
              style={{
                backgroundColor: traderStatusMeta.backgroundColor,
                borderColor: traderStatusMeta.borderColor,
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                variant="titleSmall"
                style={{ color: traderStatusMeta.textColor }}
              >
                {traderStatusMeta.bannerLabel}
              </Text>
            </View>
          ) : (
            !!item.description && (
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, lineHeight: 21 }}
              >
                {item.description}
              </Text>
            )
          )}

          <View
            style={{
              backgroundColor: isClient
                ? BRAND_COLORS.creamSoft
                : theme.colors.surfaceVariant,
              borderRadius: 12,
              padding: 10,
              gap: 8,
            }}
          >
            <View style={{ gap: 6 }}>
              {!isClient && (
                <>
                  <Text variant="bodyMedium" style={{}}>
                    Job Total: {jobTotalLabel}
                  </Text>
                  {!!scheduleLabel && (
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {scheduleLabel}
                    </Text>
                  )}
                  {!!locationLabel && (
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Location: {locationLabel}
                    </Text>
                  )}
                  {Number(item.price_cents || 0) > 0 && (
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Net to you:{" "}
                      {formatGBPCents(paymentBreakdown.netToSellerCents)}
                    </Text>
                  )}
                  <Text
                    variant="bodySmall"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      lineHeight: 20,
                      marginTop: 2,
                    }}
                  >
                    {subtitle}
                  </Text>
                </>
              )}

              {isClient && (
                <>
                  <Text
                    variant="bodyMedium"
                    style={{ color: BRAND_COLORS.maroon }}
                  >
                    Original quote: {jobTotalLabel}
                  </Text>
                  {!!scheduleLabel && (
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {scheduleLabel}
                    </Text>
                  )}
                  {!!locationLabel && (
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Location: {locationLabel}
                    </Text>
                  )}
                </>
              )}
            </View>

            <Divider />

            <View style={{ gap: 4 }}>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Next step
              </Text>
              <Text variant="bodyMedium" style={{ lineHeight: 20 }}>
                {nextStep}
              </Text>
            </View>

            {isTrader && showTraderHistoryHint && (
              <Text
                variant="bodySmall"
                style={{ color: BRAND_COLORS.maroon, lineHeight: 19 }}
              >
                View full job history in Messages
              </Text>
            )}

            {isTrader && showTraderUploadImages && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, lineHeight: 19 }}
              >
                Yakka Tip: Upload images of the before and after, for stronger
                protection.
              </Text>
            )}
          </View>

          <View
            style={{ flexDirection: "column", gap: 8 }}
          >
            <Button
              mode="contained"
              icon={isClient ? undefined : "file-document-outline"}
              onPress={() => nav.navigate("JobDetails", { jobId: item.id })}
              buttonColor={quietButton}
              textColor={BRAND_COLORS.maroon}
              style={{
                width: "100%",
                borderRadius: 18,
              }}
            >
              View job
            </Button>

            {canChat && (
              <Button
                mode="contained"
                icon={isClient ? undefined : "message-text-outline"}
                onPress={() => nav.navigate("Chat", { jobId: item.id })}
                buttonColor={isClient ? theme.colors.secondary : quietButton}
                textColor={BRAND_COLORS.maroon}
                style={{
                  width: "100%",
                  borderRadius: 18,
                }}
              >
                {isClient ? "Message tradie" : "Messages"}
              </Button>
            )}
          </View>

          <View style={{ gap: 8 }}>
            {canShare && (
              <Button
                mode="contained"
                icon="share-variant-outline"
                onPress={handleShareJob}
                buttonColor={BRAND_COLORS.orange}
                textColor={BRAND_COLORS.white}
                style={{ borderRadius: 18 }}
              >
                {isClient ? "Share job" : "Copy link"}
              </Button>
            )}

            {needsPayment && (
              <Button
                mode="contained"
                icon="credit-card-outline"
                onPress={() => nav.navigate("Payment", { jobId: item.id })}
                buttonColor={BRAND_COLORS.orange}
                textColor={BRAND_COLORS.white}
                style={{ borderRadius: 18 }}
              >
                Pay now
              </Button>
            )}

            {canReviewPricedBreakdown && (
              <Button
                mode="contained"
                icon="file-check-outline"
                onPress={() =>
                  nav.navigate("ReviewBreakdown", { jobId: item.id })
                }
                buttonColor={BRAND_COLORS.orange}
                textColor={BRAND_COLORS.white}
                style={{ borderRadius: 18 }}
              >
                Pay now
              </Button>
            )}

            {canStartTrader && (
              <Button
                mode="contained"
                icon="play-circle-outline"
                onPress={() => confirmStartFor(item, "trader")}
                buttonColor={BRAND_COLORS.orange}
                textColor={BRAND_COLORS.white}
                style={{ borderRadius: 18 }}
              >
                Start job
              </Button>
            )}

            {canConfirmStartClient && (
              <Button
                mode="contained"
                icon="play-circle-outline"
                onPress={() => confirmStartFor(item, "client")}
                buttonColor={BRAND_COLORS.orange}
                textColor={BRAND_COLORS.white}
                style={{ borderRadius: 18 }}
              >
                Confirm job started
              </Button>
            )}

            {canMarkDoneTrader && (
              <Button
                mode="contained"
                icon="check-decagram-outline"
                onPress={() => markTraderDone(item)}
                buttonColor={BRAND_COLORS.orange}
                textColor={BRAND_COLORS.white}
                style={{ borderRadius: 18 }}
              >
                Mark job complete
              </Button>
            )}

            {canMarkCompleteClient && (
              <Button
                mode="contained"
                icon="check-decagram-outline"
                onPress={() => markClientComplete(item)}
                buttonColor={BRAND_COLORS.orange}
                textColor={BRAND_COLORS.white}
                style={{ borderRadius: 18 }}
              >
                Mark job complete
              </Button>
            )}

            {showTraderUploadImages && (
              <Button
                mode="contained-tonal"
                icon="image-plus"
                onPress={() =>
                  nav.navigate("JobImages", { jobId: item.id })
                }
                style={{ borderRadius: 18 }}
              >
                Upload images
              </Button>
            )}
          </View>

          {isClient && item.status === "proposed" && (
            <Button mode="text" onPress={() => setDeclineForId(item.id)}>
              Decline
            </Button>
          )}

          {canRaiseDisputeClient && (
            <Button
              mode="contained"
              icon="alert-circle-outline"
              onPress={() => nav.navigate("Dispute", { jobId: item.id })}
              buttonColor={BRAND_COLORS.orangeSoft}
              textColor={BRAND_COLORS.maroon}
              style={{ borderRadius: 18 }}
            >
              Raise a dispute
            </Button>
          )}

          {(item.status === "disputed" || item.status === "seller_done") && (
            <Button
              mode="contained"
              icon="headset"
              onPress={() =>
                nav.navigate("ContactUs", {
                  jobId: item.id,
                  subject: `Job ${item.ref_code || item.id} support`,
                })
              }
              buttonColor={theme.colors.secondary}
              textColor={theme.colors.onSecondary}
              style={{ borderRadius: 18 }}
            >
              Contact Yakka
            </Button>
          )}

          {item.status === "disputed" && (
            <Button
              mode="contained"
              icon="file-search-outline"
              onPress={() => nav.navigate("DisputeOutcome", { jobId: item.id })}
              buttonColor={quietButton}
              textColor={BRAND_COLORS.maroon}
              style={{ borderRadius: 18 }}
            >
              View dispute
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  }

  const homeSheetRestingOffset = Math.max(
    0,
    homeActionsHeight || (isTrader ? 252 : 188),
  );
  const notificationFeed = useMemo(() => {
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const messageItems = notificationMessages.flatMap((message) => {
      const job = jobById.get(message.job_id);
      if (!job) return [];
      return [
        {
          id: `message-${message.id}`,
          kind: "message" as const,
          job,
          createdAt: message.created_at,
          title: `New message · ${job.title}`,
          detail:
            String(message.body || "New attachment").trim() || "New attachment",
        },
      ];
    });
    const jobItems = jobs.map((job) => ({
      id: `job-${job.id}`,
      kind: "job" as const,
      job,
      createdAt: job.created_at,
      title: job.title,
      detail: "",
    }));
    const clearedTime = notificationsClearedAt ? new Date(notificationsClearedAt).getTime() : 0;
    return [...messageItems, ...jobItems]
      .filter(item => new Date(item.createdAt).getTime() > clearedTime)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 50);
  }, [jobs, notificationMessages, notificationsClearedAt]);

  const homeActions = (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <View
      testID="home-actions"
      onLayout={(event) => {
        const nextHeight = Math.ceil(event.nativeEvent.layout.height);
        setHomeActionsHeight((current) =>
          current === nextHeight ? current : nextHeight,
        );
      }}
      style={{
        gap: 14,
        paddingHorizontal: screenGutter,
        paddingTop: 10,
        paddingBottom: 18,
      }}
    >
      <View style={{ gap: 3 }}>
        <Text variant="titleLarge" style={{ color: BRAND_COLORS.white }}>
          Hi {isTrader ? firstName : customerGreetingName}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: "rgba(255,255,255,0.78)", lineHeight: 21 }}
        >
          {greetingCopy}
        </Text>
      </View>

      <CreateJobAction
        onPress={() => {
          setJobsSheetExpanded(true);
          if (isTrader) setTraderCreateOpen(true);
          else setCustomerCreateOpen(true);
        }}
      />

      {isTrader && (
        <EnterJobCodeAction
          onPress={() => {
            setJobsSheetExpanded(true);
            nav.navigate("EnterJobCode");
          }}
        />
      )}
    </View>
    </ScrollView>
  );

  const notificationPanel = (
    <View style={{ flex: 1, paddingHorizontal: screenGutter, paddingTop: 22 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.12)",
          }}
        >
          <MCIcon name="bell-outline" size={24} color={BRAND_COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="headlineSmall" style={{ color: BRAND_COLORS.white }}>
            Notifications
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: "rgba(255,255,255,0.72)" }}
          >
            Job, payment and account updates.
          </Text>
        </View>
        {!!unreadNotificationCount && (
          <View
            style={{
              minWidth: 28,
              height: 28,
              borderRadius: 14,
              paddingHorizontal: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: BRAND_GRADIENT[0],
            }}
          >
            <Text variant="labelMedium" style={{ color: BRAND_COLORS.white }}>
              {unreadNotificationCount}
            </Text>
          </View>
        )}
        {!!notificationFeed.length && (
          <Button
            compact
            mode="text"
            icon="notification-clear-all"
            textColor={BRAND_COLORS.cream}
            onPress={clearNotifications}
            accessibilityLabel="Clear all notifications"
          >
            Clear all
          </Button>
        )}
      </View>

      <FlatList
        data={notificationFeed}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingBottom: 110 }}
        ListEmptyComponent={
          <View
            style={{
              borderRadius: BRAND_RADII.control,
              padding: 18,
              backgroundColor: "rgba(255,255,255,0.1)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.16)",
            }}
          >
            <Text variant="titleMedium" style={{ color: BRAND_COLORS.white }}>
              You are all caught up
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: "rgba(255,255,255,0.72)", marginTop: 4 }}
            >
              New messages, job and payment updates will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = isTrader
            ? getTraderStatusMeta(item.job, true)
            : getCustomerStatusMeta(item.job, true);
          const isMessage = item.kind === "message";
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${isMessage ? item.detail : meta.bannerLabel}`}
              onPress={() => {
                setNotificationsOpen(false);
                setTimeout(
                  () =>
                    nav.navigate(isMessage ? "Chat" : "JobDetails", {
                      jobId: item.job.id,
                    }),
                  220,
                );
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: BRAND_RADII.control,
                padding: 14,
                backgroundColor: "rgba(255,255,255,0.1)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.16)",
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: meta.backgroundColor,
                }}
              >
                <MCIcon
                  name={
                    isMessage ? "message-text-outline" : "briefcase-outline"
                  }
                  size={20}
                  color={meta.textColor}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  variant="titleMedium"
                  numberOfLines={1}
                  style={{ color: BRAND_COLORS.white }}
                >
                  {item.title}
                </Text>
                <Text
                  variant="bodySmall"
                  numberOfLines={2}
                  style={{ color: "rgba(255,255,255,0.74)", marginTop: 2 }}
                >
                  {isMessage
                    ? item.detail
                    : meta.bannerLabel.replace(/^Status:\s*/i, "")}
                </Text>
                <Text
                  variant="labelSmall"
                  style={{ color: "rgba(255,255,255,0.5)", marginTop: 3 }}
                >
                  {formatNotificationTimestamp(item.createdAt)}
                </Text>
              </View>
              <MCIcon
                name="chevron-right"
                size={22}
                color="rgba(255,255,255,0.72)"
              />
            </Pressable>
          );
        }}
      />
    </View>
  );

  const notificationBell = (
    <Animated.View
      style={{
        transform: [
          {
            rotate: bellMotion.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: ["-12deg", "0deg", "12deg"],
            }),
          },
        ],
      }}
    >
      <IconButton
        icon={unreadNotificationCount ? "bell-badge-outline" : "bell-outline"}
        iconColor={notificationsOpen ? BRAND_COLORS.orange : BRAND_COLORS.white}
        size={27}
        accessibilityLabel={
          notificationsOpen
            ? "Close notifications"
            : `${unreadNotificationCount || "No"} unread notifications`
        }
        onPress={toggleNotifications}
        style={{ margin: 0 }}
      />
    </Animated.View>
  );

  if (loading) {
    return (
      <BrandScreenFrame
        right={notificationBell}
        revealContent={notificationPanel}
        revealed={notificationsOpen}
        onRevealedChange={setNotificationsOpen}
        revealAccessibilityLabel="Notifications curtain"
      >
        <ScreenState loading title="Loading your jobs" />
      </BrandScreenFrame>
    );
  }

  return (
    <BrandScreenFrame
      right={notificationBell}
      revealContent={notificationsOpen ? notificationPanel : homeActions}
      revealed={notificationsOpen}
      onRevealedChange={setNotificationsOpen}
      revealAccessibilityLabel="Notifications curtain"
      restingOffset={homeSheetRestingOffset}
      sheetExpanded={jobsSheetExpanded}
      onSheetExpandedChange={setJobsSheetExpanded}
      revealGestureEnabled={false}
      headerAccent={jobsSheetExpanded && !notificationsOpen}
    >
      <View
        style={{ flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" }}
      >
        <View
          style={{
            paddingHorizontal: screenGutter,
            paddingTop: 38,
            paddingBottom: 14,
            backgroundColor: theme.colors.background,
            zIndex: 5,
          }}
        >
          <SwipeSegmentedControl
            value={jobFilter}
            options={HOME_JOB_OPTIONS}
            onChange={setJobFilter}
            accessibilityLabel="Show live or past jobs"
          />
        </View>
        <FlatList
          testID="home-jobs-list"
          style={{ flex: 1, width: "100%" }}
          data={filteredJobs}
          onScrollBeginDrag={() => setJobsSheetExpanded(true)}
          onScroll={(event) => {
            if (event.nativeEvent.contentOffset.y > 2 && !jobsSheetExpanded) {
              setJobsSheetExpanded(true);
            }
          }}
          scrollEventThrottle={16}
          keyExtractor={(job) => job.id}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: screenGutter }}>
              {renderJobCard(item)}
            </View>
          )}
          ListHeaderComponent={
            <View
              style={{
                gap: 12,
                paddingHorizontal: screenGutter,
                paddingTop: 2,
                paddingBottom: 14,
              }}
            >
              <Divider
                style={{ height: 2, backgroundColor: BRAND_COLORS.outline }}
              />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  variant="bodyLarge"
                  style={{ color: BRAND_COLORS.textMuted }}
                >
                  {jobFilter === "active"
                    ? `Total Live jobs: ${filteredJobs.length}`
                    : `Total Past jobs: ${filteredJobs.length}`}
                </Text>
                <MCIcon
                  name="filter-variant"
                  size={28}
                  color={BRAND_COLORS.textMuted}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            isTrader ? (
              <View
                style={{
                  paddingHorizontal: screenGutter,
                  paddingTop: 8,
                  paddingBottom: 40,
                  alignItems: "center",
                }}
              >
                <Text
                  variant="titleMedium"
                  style={{ color: BRAND_COLORS.textMuted, textAlign: "center" }}
                >
                  {jobFilter === "active" ? "No active jobs" : "No past jobs"}
                </Text>
              </View>
            ) : (
              <View
                style={{
                  paddingHorizontal: screenGutter,
                  paddingTop: 8,
                  paddingBottom: 40,
                  alignItems: "center",
                }}
              >
                <Text
                  variant="titleMedium"
                  style={{ color: BRAND_COLORS.textMuted, textAlign: "center" }}
                >
                  {jobFilter === "active" ? "No live jobs" : "No past jobs"}
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <>
        {customerShareJob?.ref_code && (
          <ShareJobSheet
            visible={!!customerShareJob}
            onDismiss={() => setCustomerShareJob(null)}
            shareLink={buildCustomerJobShare(customerShareJob.ref_code).link}
            shareMessage={
              buildCustomerJobShare(customerShareJob.ref_code).message
            }
            shareSubject={
              buildCustomerJobShare(customerShareJob.ref_code).subject
            }
            subtitle="Choose how you want to send the secure Yakka job link to your tradie."
          />
        )}

        <BottomCurtain
          visible={!!declineForId}
          onDismiss={() => setDeclineForId(null)}
          title="Decline job"
        >
          <View style={{ gap: 14 }}>
            <TextInput
              mode="outlined"
              placeholder="Reason (for example: not what we agreed)"
              value={declineText}
              onChangeText={setDeclineText}
              autoFocus
              multiline
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <Button
                onPress={() => setDeclineForId(null)}
                disabled={declining}
              >
                Cancel
              </Button>
              <Button mode="contained" onPress={doDecline} loading={declining}>
                Decline
              </Button>
            </View>
          </View>
        </BottomCurtain>

        <BottomCurtain
          visible={!!statusInfoFor}
          onDismiss={() => setStatusInfoFor(null)}
          title={
            statusInfoFor
              ? !isTrader
                ? getCustomerStatusMeta(statusInfoFor, theme.dark).bannerLabel
                : getTraderStatusMeta(statusInfoFor, theme.dark).bannerLabel
              : "Status"
          }
        >
          <View style={{ gap: 10 }}>
            {statusInfoFor && (
              <>
                <Text
                  variant="bodyMedium"
                  style={{ marginBottom: 10, lineHeight: 21 }}
                >
                  {getStatusDialogCopy(statusInfoFor)?.what}
                </Text>
                {!!getStatusDialogCopy(statusInfoFor)?.tip && (
                  <Text
                    variant="bodySmall"
                    style={{ opacity: 0.72, lineHeight: 19 }}
                  >
                    Tip: {getStatusDialogCopy(statusInfoFor)?.tip}
                  </Text>
                )}
              </>
            )}
          </View>
        </BottomCurtain>

        <BottomCurtain
          visible={customerCreateOpen}
          onDismiss={() => setCustomerCreateOpen(false)}
          title="Create job"
        >
          <View style={{ gap: 12 }}>
            <Button
              mode="contained"
              onPress={() => {
                setCustomerCreateOpen(false);
                nav.navigate("EnterJobCode", {
                  prefillRef: refCode || undefined,
                });
              }}
              buttonColor={quietButton}
              textColor={BRAND_COLORS.maroon}
              style={{ borderRadius: 18 }}
            >
              I have a job code
            </Button>
            <Button
              mode="contained"
              onPress={() => {
                setCustomerCreateOpen(false);
                setClientCreateOpen(true);
              }}
              buttonColor={BRAND_COLORS.orange}
              textColor={BRAND_COLORS.white}
              style={{ borderRadius: 18 }}
            >
              Start new job
            </Button>
          </View>
        </BottomCurtain>

        <BottomCurtain
          visible={customerHowItWorksOpen}
          onDismiss={() => setCustomerHowItWorksOpen(false)}
          title="How this works"
        >
          <View>
            <Text variant="bodyMedium" style={{ lineHeight: 22 }}>
              If your tradie has already started a job in Yakka, they&apos;ll
              send you a job code. Enter it to review the job and pay securely.
            </Text>
            <Text
              variant="bodyMedium"
              style={{ lineHeight: 22, marginTop: 14 }}
            >
              If you&apos;re starting something new, create a job to invite your
              tradie.
            </Text>
          </View>
        </BottomCurtain>

        <FlowCurtain
          visible={traderCreateOpen}
          onDismiss={() => setTraderCreateOpen(false)}
          accessibilityLabel="Create a job"
        >
          {(close) => (
            <CreateJobScreen
              embedded
              initialProfile={me}
              onDismiss={close}
              onComplete={() => {
                close();
                void loadJobs();
              }}
            />
          )}
        </FlowCurtain>

        <FlowCurtain
          visible={clientCreateOpen}
          onDismiss={() => setClientCreateOpen(false)}
          accessibilityLabel="Create a job request"
        >
          {(close) => (
            <ClientCreateJobScreen
              embedded
              initialProfile={me}
              onDismiss={close}
              onComplete={() => {
                close();
                void loadJobs();
              }}
            />
          )}
        </FlowCurtain>
      </>
    </BrandScreenFrame>
  );
}
