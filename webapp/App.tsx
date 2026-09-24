import * as React from "react";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import {
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MCIcon, { brandIconSettings } from './src/components/BrandIcon';
import {
  Provider as PaperProvider,
  useTheme,
} from "react-native-paper";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Linking, Platform, StyleSheet, Text as NativeText, TextInput as NativeTextInput, useWindowDimensions, View } from "react-native";

import { BRAND_COLORS, getBrandHeaderGradient, scaleThemeFonts, setBrandColorMode, YakaDark, YakaLight } from "./src/theme";
import { AccessibilityProvider, useAccessibilitySettings } from "./src/context/AccessibilityContext";
import BrandAppBackground from "./src/components/BrandAppBackground";
import BrandLoadingScreen from "./src/components/BrandLoadingScreen";
import AppNoticeHost from "./src/components/AppNoticeHost";
import SlideUpContent from "./src/components/SlideUpContent";
import ScreenState from "./src/components/ScreenState";
import { supabase } from "./src/lib/supabase";
import Account from "./src/screens/Account";
import AdminDashboard from "./src/screens/AdminDashboard";
import Auth from "./src/screens/Auth";
import BankDetails from "./src/screens/BankDetails";
import Chat from "./src/screens/Chat";
import ChatList from "./src/screens/ChatList";
import ClientCreateJob from "./src/screens/ClientCreateJob";
import CompletionSuccess from "./src/screens/CompletionSuccess";
import ContactUs from "./src/screens/ContactUs";
import CreateJob from "./src/screens/CreateJob";
import Dispute from "./src/screens/Dispute";
import DisputeOutcome from "./src/screens/DisputeOutcome";
import DisputeRaised from "./src/screens/DisputeRaised";
import EnterJobCode from "./src/screens/EnterJobCode";
import FinancialTracker from "./src/screens/FinancialTracker";
import Home from "./src/screens/Home";
import JobImages from "./src/screens/JobImages";
import JobRequestDetails from "./src/screens/JobRequestDetails";
import JobDetails from "./src/screens/JobDetails";
import JobsBoard from "./src/screens/JobsBoard";
import JobTimeline from "./src/screens/JobTimeline";
import Onboarding from "./src/screens/Onboarding";
import Notifications from "./src/screens/Notifications";
import PartialPaymentRequest from "./src/screens/PartialPaymentRequest";
import PartialPaymentReview from "./src/screens/PartialPaymentReview";
import Payment from "./src/screens/Payment";
import PaymentCancelled from "./src/screens/PaymentCancelled";
import PaymentReceived from "./src/screens/PaymentReceived";
import ResetPassword from "./src/screens/ResetPassword";
import ChangePassword from "./src/screens/ChangePassword";
import { acceptRecoveryUrl, getRecoveryState, subscribeRecovery } from "./src/lib/passwordRecovery";
import ReceiptSummary from "./src/screens/ReceiptSummary";
import ReviewBreakdown from "./src/screens/ReviewBreakdown";
import ReviewExperience from "./src/screens/ReviewExperience";
import StaticInfo from "./src/screens/StaticInfo";
import Settings from "./src/screens/Settings";
import TeamMembers from "./src/screens/TeamMembers";
import {
  clearOnboardingDraft,
  readOnboardingDraft,
} from "./src/utils/onboardingDraft";
import { BRAND_NATIVE_APP_MAX_WIDTH } from "./src/utils/layout";

// YAKKA provides its own in-app font-size control. Capping the additional OS
// multiplier avoids applying two independent scales and clipping labels on
// otherwise identical phones.
(NativeText as any).defaultProps = {
  ...(NativeText as any).defaultProps,
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
};
(NativeTextInput as any).defaultProps = {
  ...(NativeTextInput as any).defaultProps,
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: { ref?: string; connect?: "return" | "refresh" } | undefined;
  Join: { ref?: string } | undefined;
  MainTabs: { prefillRef?: string } | undefined;
  Notifications: undefined;
  Chat: { jobId: string };
  PublicProfile: { userId: string; publicView?: boolean };
  BankDetails: { connect?: "return" | "refresh" } | undefined;
  Payment: { jobId: string; cancelled?: boolean };
  PaymentCancelled: { scopeChangeId?: string; jobId: string; cancelled?: boolean };
  ReviewBreakdown: { jobId: string };
  CompletionSuccess: { jobId?: string; role?: "client" | "trader"; payoutPending?: boolean; message?: string };
  ReceiptSummary: { jobId: string };
  EnterJobCode: { prefillRef?: string } | undefined;
  AdminDashboard: undefined;
  JobRequestDetails: { jobId: string };
  JobTimeline: { jobId: string };
  JobsBoard:
    | { initialFilter?: "live" | "past"; profileMode?: "client_past" | "trader_past" }
    | undefined;
  PaymentReceived: { scopeChangeId?: string; jobId?: string; mode?: "stripe" | "bank" };
  ResetPassword: undefined;
  ChangePassword: undefined;
  DisputeRaised: { jobId?: string; refCode?: string };
  JobDetails: { jobId: string };
  JobImages: {
    jobId: string;
    intent?: "completion";
  };
  CreateJob: undefined;
  ClientCreateJob: undefined;
  Dispute: { jobId: string };
  DisputeOutcome: { jobId: string };
  PartialPaymentRequest: { jobId: string };
  PartialPaymentReview: { jobId: string };
  ContactUs:
    | { jobId?: string; subject?: string; category?: "get_help" | "report_bug" | "account" | "payment" | "other" }
    | undefined;
  ReviewExperience:
    | { jobId?: string; revieweeId?: string; mode?: "tradie" | "yakka" }
    | undefined;
  TeamMembers: { conversion?: boolean } | undefined;
  StaticInfo: { kind: "terms" | "privacy" | "cookies" | "fees" };
  Settings: undefined;
  FinancialTracker: undefined;
};

export type MainTabsParamList = {
  Home: { prefillRef?: string } | undefined;
  ChatList: undefined;
  Account: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabsParamList>();

class ChatScreenBoundary extends React.Component<
  { children: React.ReactNode; onBack: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {}

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: BRAND_COLORS.cream, paddingTop: 48 }}>
        <ScreenState
          title="Conversation could not open"
          message="Yakka kept the app running. Go back and refresh messages before trying again."
          icon="message-alert-outline"
          actionLabel="Go back"
          onAction={this.props.onBack}
        />
      </View>
    );
  }
}

function SafeChatScreen(props: React.ComponentProps<typeof Chat>) {
  return (
    <ChatScreenBoundary onBack={() => props.navigation.goBack()}>
      <Chat {...props} />
    </ChatScreenBoundary>
  );
}

class MessagesListBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {}

  retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: BRAND_COLORS.cream, paddingTop: 48 }}>
        <ScreenState
          title="Messages could not open"
          message="Yakka kept the app running. Try again, or use the Home tab below."
          icon="message-alert-outline"
          actionLabel="Try again"
          onAction={this.retry}
        />
      </View>
    );
  }
}

function SafeChatListScreen() {
  return (
    <MessagesListBoundary>
      <ChatList />
    </MessagesListBoundary>
  );
}

function CurtainStackLayout({ children }: { children: React.ReactNode }) {
  return (
    <BrandAppBackground>
      {Platform.OS === "web" ? <SlideUpContent>{children}</SlideUpContent> : children}
    </BrandAppBackground>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const useDesktopNavigation = Platform.OS === "web" && width >= 960;
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenLayout={({ children }) => (
        <BrandAppBackground>{children}</BrandAppBackground>
      )}
      screenOptions={{
        tabBarPosition: useDesktopNavigation ? "left" : "bottom",
        sceneStyle: { backgroundColor: "transparent" },
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: getBrandHeaderGradient(theme.dark)[0] },
        headerTintColor: BRAND_COLORS.white,
        headerTitleStyle: { fontFamily: "Satoshi-Bold" },
        headerShadowVisible: false,
        tabBarActiveTintColor: BRAND_COLORS.orange,
        tabBarInactiveTintColor: theme.colors.onSurface,
        tabBarShowLabel: true,
        tabBarLabelPosition: useDesktopNavigation ? "beside-icon" : "below-icon",
        tabBarAllowFontScaling: false,
        tabBarHideOnKeyboard: true,
        animation: Platform.OS === "web" ? "fade" : "shift",
        tabBarLabelStyle: {
          fontFamily: "Satoshi-Bold",
          fontSize: useDesktopNavigation ? 17 : theme.fonts.labelSmall.fontSize,
          lineHeight: useDesktopNavigation ? 24 : theme.fonts.labelSmall.lineHeight,
          marginTop: useDesktopNavigation ? 0 : -3,
          textAlign: "left",
        },
        tabBarStyle: {
          backgroundColor: theme.dark ? theme.colors.surfaceVariant : BRAND_COLORS.stoneSoft,
          borderTopWidth: 0,
          borderRightWidth: useDesktopNavigation ? 1 : 0,
          borderRightColor: useDesktopNavigation ? theme.colors.outlineVariant : "transparent",
          borderTopLeftRadius: useDesktopNavigation ? 0 : 20,
          borderTopRightRadius: useDesktopNavigation ? 0 : 20,
          width: useDesktopNavigation ? 244 : undefined,
          height: useDesktopNavigation ? "100%" : Math.max(72, 44 + theme.fonts.labelSmall.lineHeight) + bottomInset,
          paddingHorizontal: useDesktopNavigation ? 14 : 0,
          paddingBottom: useDesktopNavigation ? 24 : bottomInset,
          paddingTop: useDesktopNavigation ? 74 : 4,
          elevation: 8,
          shadowColor: BRAND_COLORS.maroon,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.08,
          shadowRadius: 14,
        },
        tabBarItemStyle: {
          maxHeight: useDesktopNavigation ? 58 : undefined,
          marginHorizontal: useDesktopNavigation ? 0 : 4,
          marginVertical: useDesktopNavigation ? 5 : 1,
          borderRadius: useDesktopNavigation ? 16 : 12,
          paddingHorizontal: useDesktopNavigation ? 12 : 0,
          paddingVertical: useDesktopNavigation ? 8 : 1,
        },
        tabBarActiveBackgroundColor: useDesktopNavigation ? (theme.dark ? theme.colors.surface : BRAND_COLORS.cream) : undefined,
      }}
    >
      <Tab.Screen
        name="Home"
        component={Home}
        options={{
          headerShown: false,
          title: "Home",
          tabBarIcon: ({ color }) => (
            <MCIcon name="home" color={color} size={26} />
          ),
        }}
      />
      <Tab.Screen
        name="ChatList"
        component={SafeChatListScreen}
        options={{
          headerShown: false,
          title: "Messages",
          // Reserve enough of the same three-tab row for the longest label,
          // including 160% text on a 320-point phone.
          tabBarItemStyle: {
            flex: useDesktopNavigation ? 1 : 1.4,
            maxHeight: useDesktopNavigation ? 58 : undefined,
            marginHorizontal: useDesktopNavigation ? 0 : 4,
            marginVertical: useDesktopNavigation ? 5 : 1,
            borderRadius: useDesktopNavigation ? 16 : 12,
            paddingHorizontal: useDesktopNavigation ? 12 : 0,
            paddingVertical: useDesktopNavigation ? 8 : 1,
          },
          tabBarIcon: ({ color }) => (
            <MCIcon name="message" color={color} size={26} />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={Account}
        options={{
          headerShown: false,
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <MCIcon name="account-circle" color={color} size={26} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function JoinRelay({ route, navigation }: any) {
  const ref: string | undefined = route?.params?.ref
    ? String(route.params.ref).toUpperCase()
    : undefined;

  React.useEffect(() => {
    navigation.replace("MainTabs", { prefillRef: ref });
  }, [ref, navigation]);

  return null;
}

function RootNavigator() {
  const recovery = React.useSyncExternalStore(subscribeRecovery, getRecoveryState, getRecoveryState);
  React.useEffect(() => {
    void (Platform.OS === 'web'
      ? acceptRecoveryUrl(window.location.href)
      : Linking.getInitialURL().then(acceptRecoveryUrl));
    const subscription = Linking.addEventListener('url', event => { void acceptRecoveryUrl(event.url); });
    return () => subscription.remove();
  }, []);
  const theme = useTheme();
  const jobDetailsBackdrop = getBrandHeaderGradient(theme.dark)[0];
  const [ready, setReady] = React.useState(false);
  const [session, setSession] = React.useState<any | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [sessionError, setSessionError] = React.useState('');
  const [authInitialRoute, setAuthInitialRoute] = React.useState<
    "MainTabs" | "Onboarding"
  >("MainTabs");
  const webReturn = React.useMemo(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const target = params.get('target');
    return {
      initialRoute: payment === 'success'
        ? 'PaymentReceived'
        : payment === 'cancel'
          ? 'PaymentCancelled'
          : target === 'BankDetails'
            ? 'BankDetails'
            : null,
      jobId: params.get('jobId') || undefined,
      scopeChangeId: params.get('scopeChangeId') || undefined,
    } as const;
  }, []);

  React.useEffect(() => {
    let unsub: any;
    let syncVersion = 0;
    (async () => {
      async function syncSession(nextSession: any | null) {
        const version = ++syncVersion;
        setSessionError('');

        if (!nextSession) {
          setSession(null);
          setIsAdmin(false);
          setAuthInitialRoute("MainTabs");
          setReady(true);
          return;
        }

        const { data: profile, error } = await supabase.from('profiles')
          .select('role').eq('id', nextSession.user.id).maybeSingle();
        if (version !== syncVersion) return;
        if (error) {
          setSessionError('Your account access could not be checked. Please try again.');
          setReady(true);
          return;
        }

        const draft = await readOnboardingDraft();
        const draftMatchesUser =
          !!draft &&
          (!!draft.userId
            ? draft.userId === nextSession.user?.id
            : draft.email.toLowerCase() ===
              String(nextSession.user?.email || "").toLowerCase());

        if (draft && !draftMatchesUser) {
          await clearOnboardingDraft();
        }

        if (version !== syncVersion) return;
        setSession(nextSession);
        setIsAdmin(profile?.role === 'admin');
        setAuthInitialRoute(draftMatchesUser ? "Onboarding" : "MainTabs");
        setReady(true);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      await syncSession(session ?? null);

      const { data: sub } = supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          void syncSession(newSession ?? null);
        },
      );
      unsub = sub.subscription;
    })();

    return () => {
      syncVersion++;
      unsub?.unsubscribe?.();
    };
  }, []);

  if (!ready) return <BrandLoadingScreen />;

  if (recovery.active) {
    return (
      <Stack.Navigator key="password-recovery" screenOptions={{ headerShown: false, gestureEnabled: false }}>
        <Stack.Screen name="ResetPassword" component={ResetPassword} />
        <Stack.Screen name="Auth" component={Auth} />
      </Stack.Navigator>
    );
  }

  if (sessionError) return <ScreenState title="Account access unavailable" message={sessionError}
    actionLabel="Try again" onAction={() => { void supabase.auth.refreshSession(); }} />;

  if (!session) {
    return (
      <Stack.Navigator
        screenLayout={({ children }) => <CurtainStackLayout>{children}</CurtainStackLayout>}
        screenOptions={{
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: getBrandHeaderGradient(theme.dark)[0] },
          headerTintColor: BRAND_COLORS.white,
          headerTitleStyle: { fontFamily: "Satoshi-Bold" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: "transparent" },
          animation: Platform.OS === "web" ? "none" : "slide_from_bottom",
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen
          name="Auth"
          component={Auth}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Onboarding"
          component={Onboarding}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Join"
          component={Onboarding}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ResetPassword"
          component={ResetPassword}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="StaticInfo"
          component={StaticInfo}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    );
  }

  if (isAdmin) {
    return (
      <Stack.Navigator key="admin" initialRouteName="AdminDashboard"
        screenLayout={({ children }) => <CurtainStackLayout>{children}</CurtainStackLayout>}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
        <Stack.Screen name="ChangePassword" component={ChangePassword} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      key={`${authInitialRoute}:${webReturn?.initialRoute || ''}`}
      initialRouteName={(webReturn?.initialRoute || authInitialRoute) as keyof RootStackParamList}
      screenLayout={({ children, route }) => (
        route.name === 'JobDetails'
          ? children
          : <CurtainStackLayout>{children}</CurtainStackLayout>
      )}
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: getBrandHeaderGradient(theme.dark)[0] },
        headerTintColor: BRAND_COLORS.white,
        headerTitleStyle: { fontFamily: "Satoshi-Bold" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: Platform.OS === "web" ? "none" : "slide_from_bottom",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Onboarding"
        component={Onboarding}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={Notifications}
        options={{ headerShown: false, animation: "none" }}
      />
      <Stack.Screen
        name="Chat"
        component={SafeChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PublicProfile"
        component={Account}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BankDetails"
        component={BankDetails}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Payment"
        component={Payment}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PaymentCancelled"
        component={PaymentCancelled}
        initialParams={{
          cancelled: true,
          jobId: webReturn?.jobId,
          scopeChangeId: webReturn?.scopeChangeId,
        }}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReviewBreakdown"
        component={ReviewBreakdown}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CompletionSuccess"
        component={CompletionSuccess}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReceiptSummary"
        component={ReceiptSummary}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EnterJobCode"
        component={EnterJobCode}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboard}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="ChangePassword" component={ChangePassword} options={{ headerShown: false }} />
      <Stack.Screen
        name="JobRequestDetails"
        component={JobRequestDetails}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JobTimeline"
        component={JobTimeline}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JobsBoard"
        component={JobsBoard}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PaymentReceived"
        component={PaymentReceived}
        initialParams={{
          jobId: webReturn?.jobId,
          scopeChangeId: webReturn?.scopeChangeId,
          mode: 'stripe',
        }}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPassword}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DisputeRaised"
        component={DisputeRaised}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JobDetails"
        component={JobDetails}
        layout={({ children }) => <View style={{ flex: 1, backgroundColor: jobDetailsBackdrop }}>{children}</View>}
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'none',
          gestureEnabled: false,
          contentStyle: { backgroundColor: jobDetailsBackdrop },
        }}
      />
      <Stack.Screen
        name="JobImages"
        component={JobImages}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateJob"
        component={CreateJob}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ClientCreateJob"
        component={ClientCreateJob}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Dispute"
        component={Dispute}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DisputeOutcome"
        component={DisputeOutcome}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PartialPaymentRequest"
        component={PartialPaymentRequest}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PartialPaymentReview"
        component={PartialPaymentReview}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ContactUs"
        component={ContactUs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReviewExperience"
        component={ReviewExperience}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TeamMembers"
        component={TeamMembers}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StaticInfo"
        component={StaticInfo}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={Settings}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FinancialTracker"
        component={FinancialTracker}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Join"
        component={JoinRelay}
        options={{ title: "Join" }}
      />
    </Stack.Navigator>
  );
}

const linking = {
  prefixes: ["yakka://", "https://yakka.app", "https://yakka.app/app", "https://www.yakka.app/app"],
  config: {
    screens: {
      Onboarding: {
        path: "Onboarding",
        parse: {
          connect: (v: any) =>
            v === "return" || v === "refresh" ? String(v) : undefined,
          ref: (v: any) => String(v).toUpperCase(),
        },
      },
      BankDetails: {
        path: "BankDetails",
        parse: {
          connect: (v: any) =>
            v === "return" || v === "refresh" ? String(v) : undefined,
        },
      },
      Join: {
        path: "join/:ref?",
        parse: { ref: (v: any) => String(v).toUpperCase() },
      },
      EnterJobCode: {
        path: "code/:prefillRef?",
        parse: { prefillRef: (v: any) => String(v).toUpperCase() },
      },
      ResetPassword: {
        path: "reset-password",
      },
      AdminDashboard: { path: "admin" },
      DisputeOutcome: { path: "dispute/:jobId/outcome" },
      PaymentReceived: {
        path: "payment/success",
        parse: {
          jobId: (v: any) => String(v),
          mode: (v: any) => String(v),
        },
      },
      PaymentCancelled: {
        path: "payment/cancel",
        parse: { jobId: (v: any) => String(v) },
      },
    },
  },
};

function AppContent() {
  const [fontsLoaded] = useFonts({
    "Satoshi-Regular": require("./assets/fonts/Satoshi-Regular.ttf"),
    "Satoshi-Bold": require("./assets/fonts/Satoshi-Bold.ttf"),
  });
  const { colorMode, fontScale } = useAccessibilitySettings();
  setBrandColorMode(colorMode);
  const paperTheme = React.useMemo(
    () => scaleThemeFonts(colorMode === 'dark' ? YakaDark : YakaLight, fontScale),
    [colorMode, fontScale],
  );
  const headerGradient = getBrandHeaderGradient(colorMode === 'dark');

  if (!fontsLoaded) return <BrandLoadingScreen />;

  const navigationTheme = {
    ...NavigationDefaultTheme,
    dark: paperTheme.dark,
    colors: {
      ...NavigationDefaultTheme.colors,
      primary: paperTheme.colors.primary,
      background: "transparent",
      card: paperTheme.colors.surface,
      text: paperTheme.colors.onSurface,
      border: paperTheme.colors.outline,
      notification: BRAND_COLORS.maroon,
    },
  };

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme} settings={brandIconSettings}>
        <StatusBar style="light" translucent backgroundColor={headerGradient[0]} />
        <View style={[styles.appShell, { backgroundColor: paperTheme.colors.background }]}>
          <View style={styles.nativeViewport}>
            <AppNoticeHost>
              <BrandAppBackground>
                <NavigationContainer linking={Platform.OS === 'web' ? undefined : linking} theme={navigationTheme}>
                  <RootNavigator />
                </NavigationContainer>
              </BrandAppBackground>
            </AppNoticeHost>
          </View>
        </View>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  nativeViewport: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? undefined : BRAND_NATIVE_APP_MAX_WIDTH,
    alignSelf: 'center',
    overflow: 'hidden',
  },
});

export default function App() {
  return (
    <AccessibilityProvider>
      <AppContent />
    </AccessibilityProvider>
  );
}
