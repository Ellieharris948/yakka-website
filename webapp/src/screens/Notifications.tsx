import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Chip, IconButton, useTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Text from '../components/BrandText';
import Button from '../components/BrandButton';
import MCIcon from '../components/BrandIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BrandHeaderBar from '../components/BrandHeaderBar';
import { supabase } from '../lib/supabase';
import {
  BRAND_COLORS,
  BRAND_DARK_PAGE_GRADIENT,
  BRAND_MOTION,
  BRAND_PAGE_GRADIENT,
  BRAND_RADII,
  getBrandHeaderGradient,
} from '../theme';
import { getCustomerStatusMeta, getTraderStatusMeta, JobStatus } from '../utils/statusStyles';
import { getResponsiveScreenGutter } from '../utils/layout';

type NotificationItem = {
  id: string;
  jobId: string;
  kind: 'job' | 'message';
  title: string;
  detail: string;
  time: string;
  createdAt: string;
  color: string;
  icon: string;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Notifications() {
  const theme = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const curtainY = useRef(new Animated.Value(0)).current;
  const curtainStartY = useRef(0);
  const openY = Math.max(220, height - 156 - insets.bottom);

  useEffect(() => {
    curtainY.setValue(0);
    Animated.spring(curtainY, {
      toValue: openY,
      damping: BRAND_MOTION.spring.damping,
      stiffness: BRAND_MOTION.spring.stiffness,
      mass: BRAND_MOTION.spring.mass,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [curtainY, openY]);

  const close = useCallback(() => {
    Animated.timing(curtainY, {
      toValue: 0,
      duration: BRAND_MOTION.duration.standard,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) nav.goBack();
    });
  }, [curtainY, nav]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      curtainY.stopAnimation(value => {
        curtainStartY.current = value;
      });
    },
    onPanResponderMove: (_event, gesture) => {
      curtainY.setValue(Math.max(0, Math.min(openY, curtainStartY.current + gesture.dy)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const currentY = curtainStartY.current + gesture.dy;
      const target = gesture.vy > 0.55
        ? openY
        : gesture.vy < -0.55
          ? 0
          : currentY > openY / 2
            ? openY
            : 0;
      Animated.spring(curtainY, {
        toValue: target,
        damping: BRAND_MOTION.spring.damping,
        stiffness: BRAND_MOTION.spring.stiffness,
        mass: BRAND_MOTION.spring.mass,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    },
  }), [curtainY, openY]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setUserId(user.id);
    const storedClearedAt = await AsyncStorage.getItem(`yakka_notifications_cleared_at_${user.id}`);
    setClearedAt(storedClearedAt);

    const { data, error } = await supabase
      .from('jobs')
      .select('id,title,ref_code,status,trader_id,client_id,created_at')
      .or(`trader_id.eq.${user.id},client_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) {
      Alert.alert('Notifications could not load', error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const jobs = data || [];
    const jobIds = jobs.map((job: any) => job.id);
    const { data: messageRows } = jobIds.length
      ? await supabase
          .from('messages')
          .select('id,job_id,sender_id,body,created_at')
          .in('job_id', jobIds)
          .neq('sender_id', user.id)
          .order('created_at', { ascending: false })
          .limit(40)
      : { data: [] as any[] };
    const jobById = new Map(jobs.map((job: any) => [job.id, job]));

    const jobItems = jobs.map((job: any) => {
      const isTrader = job.trader_id === user.id;
      const meta = isTrader
        ? getTraderStatusMeta(job as { status: JobStatus; client_id?: string | null }, theme.dark)
        : getCustomerStatusMeta(job as { status: JobStatus }, theme.dark);
      return {
        id: `job-${job.id}`,
        jobId: job.id,
        kind: 'job' as const,
        title: job.title || 'Job update',
        detail: meta.bannerLabel.replace('Status: ', ''),
        time: formatTime(job.created_at),
        createdAt: job.created_at,
        color: meta.backgroundColor,
        icon: job.status === 'completed' ? 'check-circle-outline' : 'briefcase-clock-outline',
      };
    });
    const messageItems = (messageRows || []).flatMap((message: any) => {
      const job: any = jobById.get(message.job_id);
      if (!job) return [];
      return [{
        id: `message-${message.id}`,
        jobId: message.job_id,
        kind: 'message' as const,
        title: `New message · ${job.title || 'Job'}`,
        detail: String(message.body || 'New attachment').trim() || 'New attachment',
        time: formatTime(message.created_at),
        createdAt: message.created_at,
        color: BRAND_COLORS.maroon,
        icon: 'message-text-outline',
      }];
    });
    const clearedTime = storedClearedAt ? new Date(storedClearedAt).getTime() : 0;
    setItems([...messageItems, ...jobItems]
      .filter(item => new Date(item.createdAt).getTime() > clearedTime)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 60));
    setLoading(false);
    setRefreshing(false);
  }, [theme.dark]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const empty = useMemo(() => !loading && items.length === 0, [items.length, loading]);
  const pageGradient = theme.dark ? BRAND_DARK_PAGE_GRADIENT : BRAND_PAGE_GRADIENT;
  const headerGradient = getBrandHeaderGradient(theme.dark);
  const clearAll = useCallback(() => {
    if (!userId) return;
    const now = new Date().toISOString();
    setClearedAt(now);
    setItems([]);
    void AsyncStorage.setItem(`yakka_notifications_cleared_at_${userId}`, now);
  }, [userId]);

  return (
    <View style={[styles.screen, { backgroundColor: headerGradient[1] }]}>
      <BrandHeaderBar
        topInset={insets.top}
        horizontalPadding={screenGutter}
        verticalPadding={15}
        right={(
          <IconButton
            icon="bell"
            iconColor={BRAND_COLORS.white}
            size={27}
            accessibilityLabel="Close notifications"
            onPress={close}
            style={{ margin: 0 }}
          />
        )}
      />

      <View style={[styles.notificationLayer, { paddingHorizontal: screenGutter }]}>
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineMedium" style={styles.heading}>Notifications</Text>
            <Text variant="bodyLarge" style={styles.subheading}>Job, payment and account updates in one place.</Text>
          </View>
          {!!items.length && (
            <Button compact mode="text" icon="notification-clear-all" textColor={BRAND_COLORS.cream} onPress={clearAll} accessibilityLabel="Clear all notifications">
              Clear all
            </Button>
          )}
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={BRAND_COLORS.maroon} /></View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            contentContainerStyle={[styles.list, empty && styles.emptyList]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}: ${item.detail}`}
                onPress={() => nav.navigate(item.kind === 'message' ? 'Chat' : 'JobDetails', { jobId: item.jobId })}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={[styles.icon, { backgroundColor: item.color }]}>
                  <MCIcon name={item.icon as any} size={23} color={BRAND_COLORS.white} />
                </View>
                <View style={styles.copy}>
                  <Text variant="titleMedium" style={styles.title}>{item.title}</Text>
                  <Text variant="bodyMedium" style={styles.detail}>{item.detail}</Text>
                  {!!item.time && <Text variant="labelMedium" style={styles.time}>{item.time}</Text>}
                </View>
                <MCIcon name="chevron-right" size={25} color={BRAND_COLORS.cream} />
              </Pressable>
            )}
            ListEmptyComponent={(
              <View style={styles.center}>
                <MCIcon name="bell-check-outline" size={46} color={BRAND_COLORS.maroon} />
                <Text variant="titleLarge" style={styles.title}>You’re all caught up</Text>
                <Text variant="bodyMedium" style={styles.time}>Job updates will appear here.</Text>
              </View>
            )}
          />
        )}
      </View>

      <Animated.View {...panResponder.panHandlers} style={[styles.curtain, { transform: [{ translateY: curtainY }] }]}>
        <LinearGradient colors={[...pageGradient]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.grabberArea}>
          <View style={[styles.grabber, { backgroundColor: theme.colors.outline }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#581a1f' },
  notificationLayer: { flex: 1, paddingTop: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  heading: { color: BRAND_COLORS.white },
  subheading: { color: '#f4f4ec', marginTop: 4, lineHeight: 22 },
  countChip: { backgroundColor: 'rgba(244,244,236,0.16)' },
  countText: { color: BRAND_COLORS.white },
  list: { gap: 8, paddingBottom: 110 },
  emptyList: { flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: 'rgba(244,244,236,0.12)', borderRadius: BRAND_RADII.card,
    borderWidth: 1, borderColor: 'rgba(244,244,236,0.2)', padding: 12,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  title: { color: BRAND_COLORS.white },
  detail: { color: BRAND_COLORS.cream, lineHeight: 20 },
  time: { color: '#fdb087', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  curtain: {
    ...StyleSheet.absoluteFillObject,
    top: 76,
    overflow: 'hidden',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#581a1f',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  grabberArea: { height: 64, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 52, height: 5, borderRadius: 999 },
});
