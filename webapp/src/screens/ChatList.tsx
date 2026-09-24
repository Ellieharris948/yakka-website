import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Divider,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from "../ui/paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import BrandScreenFrame from "../components/BrandScreenFrame";
import { supabase } from "../lib/supabase";
import { BRAND_COLORS } from "../theme";
import { getJobStatusMeta } from "../utils/statusStyles";
import { isPastJobForViewer } from "../utils/jobVisibility";
import BottomCurtain from "../components/BottomCurtain";
import { getResponsiveScreenGutter } from "../utils/layout";
import ScreenState from "../components/ScreenState";
import {
  formatChatListTime,
  normalizeChatJob,
  NormalizedChatJob,
} from "../utils/chatData";

type Job = NormalizedChatJob & {
  other_name?: string;
  viewer_role?: "trader" | "client";
  status_label?: string;
  status_color?: string;
  status_text_color?: string;
  status_border_color?: string;
  last_message?: string;
  last_message_at?: string | null;
};

type MessagePreview = {
  job_id: string;
  body: string | null;
  created_at: string | null;
};

function previewMessage(body?: string | null) {
  const value = String(body || "").trim();
  if (!value) return "No messages yet — tap to start the conversation";
  if (/https?:\/\/\S+\.(?:jpe?g|png|webp)/i.test(value))
    return "Photo attached";
  return value.replace(/https?:\/\/\S+/g, "").trim() || "Attachment shared";
}

function formatListTime(value?: string | null) {
  return formatChatListTime(value);
}

export default function ChatList() {
  const theme = useTheme();
  const nav = useNavigation<any>();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [pastOpen, setPastOpen] = useState(false);
  const [statusInfoFor, setStatusInfoFor] = useState<Job | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "attention" | "in_progress" | "complete"
  >("all");
  const [sortOrder, setSortOrder] = useState<"recent" | "oldest" | "status">(
    "recent",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openingJobRef = useRef<string | null>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const canCommit = () =>
      mountedRef.current && requestId === requestIdRef.current;

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again to load your messages.");

      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id,ref_code,trader_id,client_id,title,price_cents,status,created_at,planned_start_date,flex_days,start_date",
        )
        .or(`trader_id.eq.${user.id},client_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const scoped = (Array.isArray(data) ? data : []).flatMap((row) => {
        const job = normalizeChatJob(row);
        return job ? [job] : [];
      });
      const jobIds = scoped.map((job) => job.id);
      const otherIds = Array.from(
        new Set(
          scoped
            .map((job) =>
              job.trader_id === user.id ? job.client_id : job.trader_id,
            )
            .filter((id): id is string => !!id),
        ),
      );

      const [profiles, partialResponse, messageResponse] = await Promise.all([
        otherIds.length
          ? supabase.from("profiles").select("id,name").in("id", otherIds)
          : Promise.resolve({ data: [] as unknown[] }),
        jobIds.length
          ? supabase
              .from("partial_payment_requests")
              .select("job_id,status,created_at")
              .in("job_id", jobIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as unknown[] }),
        jobIds.length
          ? supabase
              .from("messages")
              .select("job_id,body,created_at")
              .in("job_id", jobIds)
              .order("created_at", { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      const profileMap = new Map<string, { name: string | null }>();
      for (const value of Array.isArray(profiles.data) ? profiles.data : []) {
        if (!value || typeof value !== "object") continue;
        const row = value as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!id) continue;
        profileMap.set(id, {
          name:
            typeof row.name === "string" && row.name.trim()
              ? row.name.trim()
              : null,
        });
      }

      const partialByJob = new Map<string, string>();
      for (const value of Array.isArray(partialResponse.data)
        ? partialResponse.data
        : []) {
        if (!value || typeof value !== "object") continue;
        const row = value as Record<string, unknown>;
        const rowJobId = typeof row.job_id === "string" ? row.job_id : "";
        const rowStatus = typeof row.status === "string" ? row.status : "";
        if (
          rowJobId &&
          !partialByJob.has(rowJobId) &&
          ["requested", "approved", "released"].includes(rowStatus)
        ) {
          partialByJob.set(rowJobId, rowStatus);
        }
      }

      const latestByJob = new Map<string, MessagePreview>();
      for (const value of Array.isArray(messageResponse.data)
        ? messageResponse.data
        : []) {
        if (!value || typeof value !== "object") continue;
        const row = value as Record<string, unknown>;
        const rowJobId = typeof row.job_id === "string" ? row.job_id : "";
        if (!rowJobId || latestByJob.has(rowJobId)) continue;
        latestByJob.set(rowJobId, {
          job_id: rowJobId,
          body: row.body == null ? null : String(row.body),
          created_at:
            typeof row.created_at === "string" ? row.created_at : null,
        });
      }

      const nextJobs: Job[] = scoped.map((job) => {
        const viewerRole = job.trader_id === user.id ? "trader" : "client";
        const otherId = viewerRole === "trader" ? job.client_id : job.trader_id;
        const profile = otherId ? profileMap.get(otherId) : null;
        const partialStatus = partialByJob.get(job.id);
        const meta = getJobStatusMeta(job, viewerRole, {
          dark: theme.dark,
          partialPaymentStatus: partialStatus,
        });
        const latest = latestByJob.get(job.id);
        return {
          ...job,
          viewer_role: viewerRole,
          other_name:
            profile?.name || (otherId ? "Yakka member" : "Waiting for tradie"),
          status_label: meta.bannerLabel.replace("Status: ", ""),
          status_color: meta.backgroundColor,
          status_text_color: meta.textColor,
          status_border_color: meta.borderColor,
          last_message: previewMessage(latest?.body),
          last_message_at: latest?.created_at || null,
        };
      });

      if (!canCommit()) return;
      setJobs(nextJobs);
      setLoadError(null);
    } catch (error: unknown) {
      if (!canCommit()) return;
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : "Messages could not be loaded. Please try again.",
      );
    } finally {
      if (canCommit()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [theme.dark]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let channel: any;
    let cancelled = false;
    const scheduleRefresh = () => {
      if (cancelled) return;
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        realtimeTimerRef.current = null;
        if (cancelled) return;
        void load();
      }, 200);
    };

    void supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!user || cancelled) return;
        const channelTopic = `chat-list-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        channel = supabase
          .channel(channelTopic)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "jobs" },
            scheduleRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "messages" },
            scheduleRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "partial_payment_requests" },
            scheduleRefresh,
          )
          .subscribe();
      })
      .catch(() => {
        // The focused load owns the visible retry state. Subscription setup
        // must never become an unhandled rejection on native devices.
      });
    return () => {
      cancelled = true;
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load]);

  const { liveJobs, pastJobs } = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sorted = jobs
      .filter((job) => {
        if (
          query &&
          ![job.other_name, job.title, job.ref_code, job.last_message].some(
            (value) =>
              String(value || "")
                .toLowerCase()
                .includes(query),
          )
        )
          return false;
        if (
          statusFilter === "attention" &&
          !["proposed", "accepted", "seller_done", "disputed"].includes(
            job.status,
          )
        )
          return false;
        if (
          statusFilter === "in_progress" &&
          !["funded", "in_progress", "client_done"].includes(job.status)
        )
          return false;
        if (
          statusFilter === "complete" &&
          !["completed", "cancelled"].includes(job.status)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === "status")
          return String(a.status_label).localeCompare(String(b.status_label));
        const rawATime = new Date(
          a.last_message_at || a.created_at || "",
        ).getTime();
        const rawBTime = new Date(
          b.last_message_at || b.created_at || "",
        ).getTime();
        const aTime = Number.isNaN(rawATime) ? 0 : rawATime;
        const bTime = Number.isNaN(rawBTime) ? 0 : rawBTime;
        return sortOrder === "oldest" ? aTime - bTime : bTime - aTime;
      });

    return {
      liveJobs: sorted.filter(
        (job) => !isPastJobForViewer(job, job.viewer_role || "client"),
      ),
      pastJobs: sorted.filter((job) =>
        isPastJobForViewer(job, job.viewer_role || "client"),
      ),
    };
  }, [jobs, searchQuery, sortOrder, statusFilter]);

  const renderConversation = (item: Job, onBurgundy = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open messages with ${item.other_name} for ${item.title}`}
      onPress={() => {
        const targetJobId = typeof item.id === "string" ? item.id.trim() : "";
        if (!targetJobId || openingJobRef.current) return;
        openingJobRef.current = targetJobId;
        nav.navigate("Chat", { jobId: targetJobId });
        navigationTimerRef.current = setTimeout(() => {
          openingJobRef.current = null;
          navigationTimerRef.current = null;
        }, 700);
      }}
      style={({ pressed }) => [
        styles.conversationRow,
        {
          backgroundColor: onBurgundy
            ? "rgba(255,255,255,0.11)"
            : theme.colors.surface,
        },
        pressed && styles.cardPressed,
      ]}
    >
      {/* Initials avoid decoding unbounded third-party/profile images in the native conversation list. */}
      <Avatar.Text
        size={46}
        label={String(item.other_name || "Y")
          .trim()
          .slice(0, 1)
          .toUpperCase()}
        style={{
          backgroundColor: onBurgundy
            ? "rgba(255,255,255,0.2)"
            : theme.colors.surfaceVariant,
        }}
        color={onBurgundy ? BRAND_COLORS.white : BRAND_COLORS.maroon}
      />

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text
          variant="titleMedium"
          numberOfLines={1}
          style={{
            color: onBurgundy ? BRAND_COLORS.white : theme.colors.onSurface,
            fontFamily: "Satoshi-Bold",
          }}
        >
          {item.other_name}
        </Text>
        <Text
          variant="bodyMedium"
          numberOfLines={1}
          style={{
            color: onBurgundy
              ? "rgba(255,255,255,0.76)"
              : theme.colors.onSurfaceVariant,
          }}
        >
          {item.last_message}
        </Text>
        <Text
          variant="labelSmall"
          numberOfLines={1}
          style={{
            color: onBurgundy
              ? "rgba(255,255,255,0.58)"
              : theme.colors.onSurfaceVariant,
          }}
        >
          {item.ref_code || item.id.slice(0, 8).toUpperCase()} · {item.title}
        </Text>
      </View>

      <View
        style={{
          alignItems: "flex-end",
          alignSelf: "stretch",
          justifyContent: "space-between",
          paddingVertical: 2,
        }}
      >
        <Text
          variant="labelSmall"
          style={{
            color: onBurgundy
              ? "rgba(255,255,255,0.66)"
              : theme.colors.onSurfaceVariant,
          }}
        >
          {formatListTime(item.last_message_at)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show job stage: ${item.status_label}`}
          hitSlop={10}
          onPress={(event) => {
            event.stopPropagation();
            setStatusInfoFor(item);
          }}
          style={({ pressed }) => [
            styles.statusDotButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={styles.statusDot} />
        </Pressable>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <BrandScreenFrame>
        <View style={styles.loading}>
          <ActivityIndicator color={BRAND_COLORS.maroon} />
        </View>
      </BrandScreenFrame>
    );
  }

  if (loadError && jobs.length === 0) {
    return (
      <BrandScreenFrame>
        <ScreenState
          title="Messages could not load"
          message={loadError}
          icon="message-alert-outline"
          actionLabel="Try again"
          onAction={() => {
            setLoadError(null);
            setLoading(true);
            void load();
          }}
        />
      </BrandScreenFrame>
    );
  }

  const historyButton = (
    <IconButton
      icon="history"
      iconColor={pastOpen ? BRAND_COLORS.orange : BRAND_COLORS.white}
      size={26}
      accessibilityLabel={
        pastOpen ? "Close past job messages" : "Open past job messages"
      }
      onPress={() => setPastOpen((open) => !open)}
      style={{ margin: 0 }}
    />
  );

  const pastMessagesPanel = (
    <View style={styles.pastPanel}>
      <View style={[styles.pastHeading, { paddingHorizontal: screenGutter }]}>
        <Text
          variant="headlineSmall"
          style={{ color: BRAND_COLORS.white, fontFamily: "Satoshi-Bold" }}
        >
          Past job messages
        </Text>
        <Text variant="bodySmall" style={{ color: "rgba(255,255,255,0.72)" }}>
          Swipe the cream panel up to return to live messages.
        </Text>
      </View>
      <FlatList
        data={pastJobs}
        keyExtractor={(job) => `past-${job.id}`}
        renderItem={({ item }) => renderConversation(item, true)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.pastListContent,
          { paddingHorizontal: screenGutter },
        ]}
        ListEmptyComponent={
          <Text
            variant="bodyLarge"
            style={{ color: "rgba(255,255,255,0.72)", paddingTop: 18 }}
          >
            No past conversations match your search.
          </Text>
        }
      />
    </View>
  );

  return (
    <BrandScreenFrame
      bodyStyle={styles.contentPanel}
      right={historyButton}
      revealContent={pastMessagesPanel}
      revealed={pastOpen}
      onRevealedChange={setPastOpen}
      revealAccessibilityLabel="Past job messages"
    >
      <BottomCurtain
        visible={filterOpen}
        onDismiss={() => setFilterOpen(false)}
        title="Sort and filter messages"
      >
        <View style={{ gap: 8 }}>
          <Text
            variant="labelLarge"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Filter by status
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                ["all", "All conversations"],
                ["attention", "Needs attention"],
                ["in_progress", "In progress"],
                ["complete", "Complete"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                mode={statusFilter === value ? "contained" : "contained-tonal"}
                onPress={() => setStatusFilter(value)}
                icon={statusFilter === value ? "check" : undefined}
              >
                {label}
              </Button>
            ))}
          </View>
          <Divider style={{ marginVertical: 6 }} />
          <Text
            variant="labelLarge"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Sort by
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                ["recent", "Most recent"],
                ["oldest", "Oldest first"],
                ["status", "Job status"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                mode={sortOrder === value ? "contained" : "contained-tonal"}
                onPress={() => setSortOrder(value)}
                icon={sortOrder === value ? "check" : undefined}
              >
                {label}
              </Button>
            ))}
          </View>
        </View>
      </BottomCurtain>

      <BottomCurtain
        visible={!!statusInfoFor}
        onDismiss={() => setStatusInfoFor(null)}
        title={statusInfoFor?.status_label || "Job stage"}
      >
        {statusInfoFor && (
          <View style={{ gap: 10 }}>
            <Text variant="titleMedium">{statusInfoFor.other_name}</Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, lineHeight: 21 }}
            >
              {statusInfoFor.title} · Job{" "}
              {statusInfoFor.ref_code ||
                statusInfoFor.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text variant="bodyMedium" style={{ lineHeight: 21 }}>
              This conversation is currently at the “
              {statusInfoFor.status_label}” stage.
            </Text>
          </View>
        )}
      </BottomCurtain>

      <FlatList
        data={liveJobs}
        style={styles.conversationList}
        keyExtractor={(job) => job.id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load();
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.pageHeading}>
              <View style={{ flex: 1 }}>
                <Text
                  variant="headlineMedium"
                  style={[styles.pageTitle, { color: theme.colors.onSurface }]}
                >
                  Messages
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                >
                  Swipe down for past job messages
                </Text>
              </View>
              <IconButton
                icon="filter-variant"
                size={27}
                iconColor={
                  statusFilter !== "all" || sortOrder !== "recent"
                    ? BRAND_COLORS.orange
                    : theme.colors.onSurface
                }
                accessibilityLabel="Sort and filter messages"
                onPress={() => setFilterOpen(true)}
              />
            </View>
            <TextInput
              mode="outlined"
              placeholder="Search messages"
              value={searchQuery}
              onChangeText={setSearchQuery}
              left={<TextInput.Icon icon="magnify" />}
              right={
                searchQuery ? (
                  <TextInput.Icon
                    icon="close"
                    onPress={() => setSearchQuery("")}
                  />
                ) : undefined
              }
              style={styles.searchInput}
            />
          </View>
        }
        renderItem={({ item }) => renderConversation(item)}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text
              variant="titleLarge"
              style={[styles.emptyTitle, { color: theme.colors.onSurface }]}
            >
              No live conversations
            </Text>
            <Text
              style={[
                styles.emptyCopy,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {searchQuery
                ? "No live messages match your search."
                : "Your active job conversations will appear here."}
            </Text>
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: screenGutter },
        ]}
      />
    </BrandScreenFrame>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  contentPanel: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  pageTitle: {
    color: BRAND_COLORS.maroon,
    fontFamily: "Satoshi-Bold",
  },
  filterMenu: {
    backgroundColor: BRAND_COLORS.creamSoft,
    borderRadius: 20,
    paddingVertical: 8,
  },
  menuHeading: {
    color: BRAND_COLORS.maroon,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 3,
  },
  conversationList: {
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
  },
  listContent: {
    paddingBottom: 34,
    flexGrow: 1,
  },
  listHeader: {
    paddingTop: 18,
    paddingBottom: 16,
  },
  searchInput: {
    borderRadius: 18,
    overflow: "hidden",
  },
  conversationRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
    shadowColor: BRAND_COLORS.maroon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 7,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  statusDotButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  statusDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#2D8CFF",
    shadowColor: "#2D8CFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 2,
  },
  pastPanel: {
    flex: 1,
    paddingTop: 20,
  },
  pastHeading: {
    paddingBottom: 12,
    gap: 4,
  },
  pastListContent: {
    paddingBottom: 80,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 56,
  },
  emptyTitle: {
    color: BRAND_COLORS.maroon,
    fontFamily: "Satoshi-Bold",
    marginBottom: 8,
  },
  emptyCopy: {
    color: BRAND_COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
});
