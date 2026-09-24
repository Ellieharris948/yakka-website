import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Avatar,
  Button,
  Card,
  Checkbox,
  Chip,
  HelperText,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from '../ui/paper';

import { supabase } from '../lib/supabase';
import { pickProfileImage, uploadAvatar, uploadProfileDocument } from '../utils/avatar';
import {
  AppRole,
  clearOnboardingDraft,
  OnboardingDraft,
  PostAuthScreen,
  readOnboardingDraft,
  TraderMode,
  writeOnboardingDraft,
} from '../utils/onboardingDraft';
import { BRAND_COLORS, BRAND_GRADIENT } from '../theme';
import LocationInput from '../components/LocationInput';
import BrandHeaderBar from '../components/BrandHeaderBar';
import PageBackHeader from '../components/PageBackHeader';
import {
  buildStripeConnectUrls,
  parseStripeConnectIntent,
  StripeConnectIntent,
} from '../utils/stripeConnect';
import { isValidUkMobile, normalizeUkPhone } from '../utils/phone';
import { invokeEdgeFunction } from '../utils/edgeFunctions';
import { isValidVatRegistrationNumber, normalizeVatRegistrationNumber, VAT_REGISTRATION_URL } from '../utils/vat';
import BrandSwitch from '../components/BrandSwitch';
import { BRAND_CONTENT_MAX_WIDTH, getResponsiveScreenGutter } from '../utils/layout';
import ScreenState from '../components/ScreenState';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const STRONG_PASSWORD_RE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\+\-=\[\]{};':"\\|,.<>\/?`~]).{6,}$/;
const TAG_OPTIONS = [
  'Builder',
  'Painter & Decorator',
  'Plumber',
  'Electrician',
  'Carpenter & Joiner',
  'Plasterer',
];

type Screen =
  | 'role'
  | 'trader_mode'
  | 'customer_account'
  | 'trader_account'
  | 'trader_business'
  | 'trader_password'
  | 'customer_welcome'
  | 'verify_identity'
  | 'verification_pending'
  | 'profile_trades'
  | 'profile_location'
  | 'profile_accreditations'
  | 'profile_avatar'
  | 'team_members';

type StripeVerificationError = {
  code?: string | null;
  reason?: string | null;
  requirement?: string | null;
};

type StripeVerificationStatus = {
  accountId: string | null;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
  pastDue: string[];
  pendingVerification: string[];
  eventuallyDue: string[];
  errors: StripeVerificationError[];
};

const phoneStyle = {
  width: '100%' as const,
  maxWidth: BRAND_CONTENT_MAX_WIDTH,
  alignSelf: 'center' as const,
  borderRadius: 34,
  overflow: 'hidden' as const,
  borderWidth: 1,
};

function isMissingStructuredTeamSchemaError(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('team_accounts') ||
    message.includes('team_members') ||
    message.includes('schema cache')
  );
}

function isMissingTradieProfileSchemaError(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('trader_mode') ||
    message.includes('business_accreditations') ||
    message.includes('qualifications') ||
    message.includes('public_liability_insurance') ||
    message.includes('vat_registered') ||
    message.includes('vat_registration_number') ||
    message.includes('schema cache')
  );
}

function formatSignUpError(error: any) {
  const message = String(error?.message || '').trim();
  const normalized = message.toLowerCase();
  const errorCode = String(error?.code || error?.error_code || '').toLowerCase();

  if (errorCode === 'user_already_exists' || normalized.includes('user already registered')) {
    return 'An account already exists for this email. Try logging in instead.';
  }
  if (normalized.includes('mobile number is already') || normalized.includes('phone') && normalized.includes('already')) {
    return 'This mobile number is already linked to another account. Please log in to that account or use a different number.';
  }
  if (normalized.includes('network request failed') || normalized.includes('network status')) {
    return 'Yakka could not reach the account server. Check your connection and try again; your details are saved on this device.';
  }
  if (normalized.includes('database error saving new user')) {
    return 'The account could not be created. Check whether the email or mobile number is already in use, then try again.';
  }
  if (errorCode === 'weak_password' || normalized.includes('weak password') || normalized.includes('character of each')) {
    return 'Use at least 6 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.';
  }
  if (normalized.includes('password')) {
    return message || 'Use at least 6 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.';
  }
  if (normalized.includes('email')) {
    return message || 'Please enter a valid email address.';
  }
  if (error?.status === 422) {
    return message || 'Please check your email address and password, then try again.';
  }
  return message || 'Something went wrong, please try again.';
}

function isUserAlreadyExistsError(error: any) {
  const message = String(error?.message || '').toLowerCase();
  const errorCode = String(error?.code || error?.error_code || '').toLowerCase();
  return errorCode === 'user_already_exists' || message.includes('user already registered');
}

function splitName(fullName: string) {
  const clean = fullName.trim().replace(/\s+/g, ' ');
  if (!clean) return { firstName: '', lastName: '' };
  const parts = clean.split(' ');
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

function hasStripeNameMismatch(status: StripeVerificationStatus | null) {
  if (!status) return false;
  return status.errors.some(error =>
    /name_mismatch/i.test(`${error.code || ''} ${error.reason || ''}`),
  );
}

function formatStripeRequirement(field: string) {
  return field.replace(/\./g, ' ').replace(/_/g, ' ').trim();
}

function screenFromDraft(draft: OnboardingDraft | null): Screen {
  if (!draft) return 'role';
  if (draft.role === 'client') return 'customer_welcome';

  const map: Record<PostAuthScreen, Screen> = {
    customer_welcome: 'customer_welcome',
    verify_identity: 'verify_identity',
    verification_pending: 'verification_pending',
    profile_trades: 'profile_trades',
    profile_location: 'profile_location',
    profile_accreditations: 'profile_accreditations',
    profile_avatar: 'profile_avatar',
    team_members: 'team_members',
  };

  return map[draft.postAuthScreen || 'verify_identity'];
}

function sentenceCaseAction(value: string) {
  if (!/^[A-Z0-9 &!/+.-]+$/.test(value)) return value;
  const lower = value
    .toLowerCase()
    .replace(/\byakka\b/g, 'Yakka')
    .replace(/\bstripe\b/g, 'Stripe')
    .replace(/\bid\b/g, 'ID');
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function Shell({
  screenLabel,
  headline,
  subtitle,
  progress,
  children,
  footer,
}: {
  screenLabel?: string;
  headline: string;
  subtitle?: string;
  progress?: { step: number; total: number };
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);

  return (
    <Card
      mode="contained"
      style={[
        phoneStyle,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >

      <View style={{ paddingHorizontal: screenGutter, paddingTop: 22, paddingBottom: 18, gap: 16 }}>
        <View style={{ gap: 8 }}>
          {!!screenLabel && (
            <Text variant="labelLarge" style={{ color: BRAND_COLORS.orange }}>
              {screenLabel}
            </Text>
          )}
          <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontFamily: 'Satoshi-Bold' }}>
            {sentenceCaseAction(headline)}
          </Text>
          {!!subtitle && (
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 26 }}>
              {subtitle}
            </Text>
          )}
        </View>

        {!!progress && (
          <View style={{ gap: 8 }}>
            <View
              style={{
                height: 10,
                borderRadius: 999,
                backgroundColor: BRAND_COLORS.stoneSoft,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${(progress.step / progress.total) * 100}%`,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: BRAND_GRADIENT[0],
                }}
              />
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Step {progress.step}/{progress.total}
            </Text>
          </View>
        )}

        {children}
      </View>

      {!!footer && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.outline,
            paddingHorizontal: screenGutter,
            paddingVertical: 14,
          }}
        >
          {footer}
        </View>
      )}
    </Card>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Button
      mode="contained"
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      buttonColor={BRAND_COLORS.orange}
      textColor={BRAND_COLORS.white}
      style={{ borderRadius: 18 }}
      contentStyle={{ paddingVertical: 8 }}
    >
      {sentenceCaseAction(label)}
    </Button>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      mode="contained"
      onPress={onPress}
      disabled={disabled}
      buttonColor={BRAND_COLORS.orangeSoft}
        textColor={BRAND_COLORS.maroon}
      style={{ borderRadius: 18 }}
      contentStyle={{ paddingVertical: 8 }}
    >
      {sentenceCaseAction(label)}
    </Button>
  );
}

function OnboardingContent() {
  const theme = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);

  const deepRefCode = route?.params?.ref ? String(route.params.ref).toUpperCase() : '';
  const routeConnectIntent = route?.params?.connect as StripeConnectIntent | undefined;

  const [hydrating, setHydrating] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [screen, setScreen] = useState<Screen>('role');

  const [role, setRole] = useState<AppRole | null>(null);
  const [traderMode, setTraderMode] = useState<TraderMode | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [clientRefCode, setClientRefCode] = useState(deepRefCode);
  const [businessName, setBusinessName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState('');
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatRegistrationNumber, setVatRegistrationNumber] = useState('');
  const [vatInfoOpen, setVatInfoOpen] = useState(false);
  const [tradeQuery, setTradeQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [idDocumentLocalUri, setIdDocumentLocalUri] = useState<string | null>(null);
  const [accreditationLocalUri, setAccreditationLocalUri] = useState<string | null>(null);
  const [verificationConfirmed, setVerificationConfirmed] = useState(false);
  const [stripeVerificationBusy, setStripeVerificationBusy] = useState(false);
  const [stripeVerificationStatus, setStripeVerificationStatus] = useState<StripeVerificationStatus | null>(null);
  const [initialUrlConnectIntent, setInitialUrlConnectIntent] = useState<StripeConnectIntent | null>(null);
  const [teamInviteInput, setTeamInviteInput] = useState('');
  const [teamInviteEmails, setTeamInviteEmails] = useState<string[]>([]);
  const lastHandledStripeIntentRef = useRef<StripeConnectIntent | null>(null);

  const goBack = useCallback(() => {
    if (isAuthenticated) return false;

    const previousScreen: Partial<Record<Screen, Screen>> = {
      trader_mode: 'role',
      customer_account: 'role',
      trader_account: 'trader_mode',
      trader_business: 'trader_account',
      trader_password: 'trader_business',
    };
    const previous = previousScreen[screen];
    if (previous) {
      setScreen(previous);
      return true;
    }

    nav.goBack();
    return true;
  }, [isAuthenticated, nav, screen]);

  useEffect(() => {
    if (isAuthenticated) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [goBack, isAuthenticated]);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = !normalizedEmail || EMAIL_RE.test(normalizedEmail);
  const passwordValid = STRONG_PASSWORD_RE.test(password);
  const passwordsMatch = password === confirmPassword;
  const customerFullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const fullName =
    traderMode === 'team'
      ? tradingName.trim() || businessName.trim()
      : `${firstName.trim()} ${lastName.trim()}`.trim();
  const normalizedPhone = normalizeUkPhone(phone);
  const phoneValid = isValidUkMobile(phone);
  const resolvedConnectIntent = useMemo(() => {
    if (routeConnectIntent) return routeConnectIntent;
    if (initialUrlConnectIntent) return initialUrlConnectIntent;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return parseStripeConnectIntent(window.location.href);
    }

    return null;
  }, [initialUrlConnectIntent, routeConnectIntent]);

  const filteredTags = useMemo(() => {
    const query = tradeQuery.trim().toLowerCase();
    return TAG_OPTIONS.filter(tag => tag.toLowerCase().includes(query));
  }, [tradeQuery]);
  const stripeNeedsMoreInfo = useMemo(() => {
    if (!stripeVerificationStatus) return false;
    return (
      !!stripeVerificationStatus.disabledReason ||
      stripeVerificationStatus.currentlyDue.length > 0 ||
      stripeVerificationStatus.pastDue.length > 0 ||
      stripeVerificationStatus.errors.length > 0
    );
  }, [stripeVerificationStatus]);
  const stripeVerificationSubmitted = useMemo(() => {
    if (!stripeVerificationStatus || stripeNeedsMoreInfo) return false;
    return (
      stripeVerificationStatus.payoutsEnabled ||
      stripeVerificationStatus.detailsSubmitted ||
      stripeVerificationStatus.pendingVerification.length > 0
    );
  }, [stripeNeedsMoreInfo, stripeVerificationStatus]);
  const stripeRequiredFieldsPreview = useMemo(() => {
    if (!stripeVerificationStatus) return '';
    return Array.from(new Set([
      ...stripeVerificationStatus.currentlyDue,
      ...stripeVerificationStatus.pastDue,
      ...stripeVerificationStatus.pendingVerification,
    ])).slice(0, 3).map(formatStripeRequirement).join(', ');
  }, [stripeVerificationStatus]);
  const stripeVerificationHeadline = stripeVerificationStatus?.payoutsEnabled
    ? 'Verified'
    : stripeNeedsMoreInfo
      ? 'More information needed'
      : stripeVerificationSubmitted
        ? 'Submitted to Stripe'
        : 'Not started';
  const stripeVerificationBody = stripeVerificationStatus?.payoutsEnabled
    ? 'Stripe has verified the payout account and identity checks for this Yakka account.'
    : stripeNeedsMoreInfo
      ? stripeRequiredFieldsPreview
        ? `Stripe still needs: ${stripeRequiredFieldsPreview}.`
        : 'Stripe still needs a little more information before this account can be approved.'
      : stripeVerificationSubmitted
        ? 'Stripe has received the verification details and is now reviewing them.'
        : 'Stripe will securely collect the government ID and confirm the legal name matches this account.';

  const traderAccountValid =
    traderMode === 'team'
      ? !!tradingName.trim() && !!normalizedEmail && emailValid && phoneValid
      : !!firstName.trim() && !!lastName.trim() && !!normalizedEmail && emailValid && phoneValid;

  const customerAccountValid =
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!normalizedEmail &&
    emailValid &&
    phoneValid &&
    passwordValid &&
    passwordsMatch &&
    acceptTerms;

  const traderPasswordValid = passwordValid && passwordsMatch && acceptTerms;
  const verificationNameValid =
    traderMode === 'team'
      ? !!(tradingName.trim() || businessName.trim())
      : !!firstName.trim() && !!lastName.trim();

  useEffect(() => {
    let active = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session) {
        setIsAuthenticated(false);
        setClientRefCode(deepRefCode);
        setScreen('role');
        setHydrating(false);
        return;
      }

      setIsAuthenticated(true);
      const draft = await readOnboardingDraft();
      if (!active) return;

      const matchesUser =
        !!draft &&
        (!!draft.userId
          ? draft.userId === session.user.id
          : draft.email.toLowerCase() === String(session.user.email || '').toLowerCase());

      if (!matchesUser || !draft) {
        setHydrating(false);
        nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        return;
      }

      setRole(draft.role);
      setTraderMode(draft.traderMode || null);
      const legacyName = splitName(draft.fullName || '');
      setFirstName(draft.firstName || legacyName.firstName);
      setLastName(draft.lastName || legacyName.lastName);
      setPhone(draft.phone || '');
      setEmail(draft.email || '');
      setClientRefCode(draft.clientRefCode || '');
      setBusinessName(draft.businessName || '');
      setTradingName(draft.tradingName || '');
      setWorkAddress(draft.workAddress || '');
      setPostcode(draft.postcode || '');
      setCompanyRegistrationNumber(draft.companyRegistrationNumber || '');
      setVatRegistered(draft.vatRegistered === true);
      setVatRegistrationNumber(draft.vatRegistrationNumber || '');
      setTags(draft.tags || []);
      setLocation(draft.location || '');
      setAvatarLocalUri(draft.avatarLocalUri || null);
      setAccreditationLocalUri(draft.accreditationLocalUri || null);
      setIdDocumentLocalUri(draft.idDocumentLocalUri || null);
      setTeamInviteEmails(draft.teamInviteEmails || []);
      setScreen(screenFromDraft(draft));
      setHydrating(false);
    })();

    return () => {
      active = false;
    };
  }, [deepRefCode, nav]);

  useEffect(() => {
    let active = true;

    Linking.getInitialURL()
      .then(url => {
        if (!active) return;
        setInitialUrlConnectIntent(parseStripeConnectIntent(url));
      })
      .catch(() => {});

    const sub = Linking.addEventListener('url', event => {
      setInitialUrlConnectIntent(parseStripeConnectIntent(event.url));
    });

    return () => {
      active = false;
      sub.remove?.();
    };
  }, []);

  const persistPostAuthDraft = useCallback(
    async (nextScreen: PostAuthScreen, extras?: Partial<OnboardingDraft>) => {
      await writeOnboardingDraft({
        email: normalizedEmail,
        userId: extras?.userId || undefined,
        role: role || 'client',
        traderMode,
        fullName: role === 'client' ? customerFullName.trim() : fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizedPhone,
        clientRefCode: clientRefCode.trim().toUpperCase(),
        businessName: businessName.trim(),
        tradingName: tradingName.trim(),
        workAddress: workAddress.trim(),
        postcode: postcode.trim().toUpperCase(),
        companyRegistrationNumber: companyRegistrationNumber.trim(),
        vatRegistered,
        vatRegistrationNumber: vatRegistered ? normalizeVatRegistrationNumber(vatRegistrationNumber) : '',
        tags,
        location: location.trim(),
        teamInviteEmails,
        avatarLocalUri,
        accreditationLocalUri,
        idDocumentLocalUri,
        postAuthScreen: nextScreen,
        ...extras,
      });
    },
    [
      accreditationLocalUri,
      avatarLocalUri,
      businessName,
      clientRefCode,
      companyRegistrationNumber,
      customerFullName,
      firstName,
      fullName,
      idDocumentLocalUri,
      lastName,
      location,
      normalizedEmail,
      phone,
      role,
      tags,
      teamInviteEmails,
      traderMode,
      tradingName,
      workAddress,
      postcode,
      vatRegistered,
      vatRegistrationNumber,
    ],
  );

  const pickImage = useCallback(async (kind: 'avatar' | 'id' | 'accreditation') => {
    try {
      const uri = await pickProfileImage();
      if (!uri) return;

      if (kind === 'avatar') setAvatarLocalUri(uri);
      if (kind === 'id') setIdDocumentLocalUri(uri);
      if (kind === 'accreditation') setAccreditationLocalUri(uri);
    } catch (e: any) {
      Alert.alert('Upload', e.message || 'Could not choose that file.');
    }
  }, []);

  const saveBaseProfile = useCallback(
    async (userId: string, selectedRole: AppRole) => {
      const payload: any = {
        id: userId,
        role: selectedRole,
        name: selectedRole === 'client' ? customerFullName.trim() : fullName,
        email: normalizedEmail,
        phone: normalizedPhone || null,
        country_code: 'GB',
      };

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
    },
    [customerFullName, fullName, normalizedEmail, phone],
  );

  const ensureTeamAccount = useCallback(
    async (userId: string) => {
      const { data: existing, error: existingError } = await supabase
        .from('team_accounts')
        .select('*')
        .eq('owner_user_id', userId)
        .maybeSingle();

      if (existingError) {
        if (isMissingStructuredTeamSchemaError(existingError)) return null;
        throw existingError;
      }

      const payload = {
        owner_user_id: userId,
        name: tradingName.trim() || businessName.trim() || fullName,
        team_mode: 'team',
        business_name: businessName.trim() || tradingName.trim() || null,
        company_registration_number: companyRegistrationNumber.trim() || null,
        trading_name: tradingName.trim() || null,
        work_address: workAddress.trim() || null,
        postcode: postcode.trim().toUpperCase() || null,
        payout_provider: 'stripe',
        payout_status: 'not_started',
        verification_status: 'pending',
      };

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('team_accounts')
          .update(payload)
          .eq('id', existing.id);
        if (updateError) throw updateError;

        const { error: ownerError } = await supabase.from('team_members').upsert(
          {
            team_account_id: existing.id,
            user_id: userId,
            email: normalizedEmail,
            role: 'account_owner',
            status: 'active',
            invited_by: userId,
            accepted_at: new Date().toISOString(),
          },
          { onConflict: 'team_account_id,email' },
        );
        if (ownerError) throw ownerError;
        return existing.id as string;
      }

      const { data, error } = await supabase.from('team_accounts').insert(payload).select().single();
      if (error) {
        if (isMissingStructuredTeamSchemaError(error)) return null;
        throw error;
      }

      const { error: ownerMemberError } = await supabase.from('team_members').upsert(
        {
          team_account_id: data.id,
          user_id: userId,
          email: normalizedEmail,
          role: 'account_owner',
          status: 'active',
          invited_by: userId,
          accepted_at: new Date().toISOString(),
        },
        { onConflict: 'team_account_id,email' },
      );
      if (ownerMemberError) {
        if (isMissingStructuredTeamSchemaError(ownerMemberError)) return null;
        throw ownerMemberError;
      }

      return data.id as string;
    },
    [businessName, companyRegistrationNumber, fullName, normalizedEmail, postcode, tradingName, workAddress],
  );

  const saveTeamInvites = useCallback(
    async (userId: string, teamAccountId?: string | null) => {
      if (traderMode !== 'team' || !teamInviteEmails.length) return;

      let shouldUseLegacyInvites = !teamAccountId;

      if (teamAccountId) {
        for (const inviteEmail of teamInviteEmails) {
          const normalizedInvite = inviteEmail.trim().toLowerCase();
          if (!normalizedInvite) continue;

          const { error } = await supabase.from('team_members').upsert(
            {
              team_account_id: teamAccountId,
              email: normalizedInvite,
              role: 'team_member',
              status: 'invited',
              invited_by: userId,
            },
            { onConflict: 'team_account_id,email' },
          );
          if (error) {
            if (!isMissingStructuredTeamSchemaError(error)) throw error;
            shouldUseLegacyInvites = true;
            break;
          }
        }
      }

      if (!shouldUseLegacyInvites) {
        return;
      }

      for (const inviteEmail of teamInviteEmails) {
        const normalizedInvite = inviteEmail.trim().toLowerCase();
        if (!normalizedInvite) continue;

        const { error } = await supabase.from('team_invites').insert({
          owner_id: userId,
          email: normalizedInvite,
          role: 'team_member',
          status: 'invited',
        });
        if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
          throw error;
        }
      }
    },
    [teamInviteEmails, traderMode],
  );

  const finishSignedInOnboarding = useCallback(
    async (userId: string, selectedRole: AppRole, preparedDraft: OnboardingDraft) => {
      await writeOnboardingDraft({
        ...preparedDraft,
        userId,
      });

      await saveBaseProfile(userId, selectedRole);

      if (selectedRole === 'trader') {
        if (traderMode === 'team') {
          const teamAccountId = await ensureTeamAccount(userId);
          if (teamInviteEmails.length) {
            await saveTeamInvites(userId, teamAccountId);
          }
        }
      }

      setIsAuthenticated(true);
      setHydrating(false);
      setScreen(selectedRole === 'client' ? 'customer_welcome' : 'verify_identity');
    },
    [
      ensureTeamAccount,
      saveBaseProfile,
      saveTeamInvites,
      teamInviteEmails.length,
      traderMode,
    ],
  );

  const startStripePayoutSetup = useCallback(async () => {
    lastHandledStripeIntentRef.current = null;
    const { returnUrl, refreshUrl } = buildStripeConnectUrls();
    const data = await invokeEdgeFunction('create-stripe-connect-account', { returnUrl, refreshUrl });
    if (!data?.url) throw new Error(data?.error || 'Stripe did not return a verification link.');

    const canOpen = await Linking.canOpenURL(data.url);
    if (!canOpen) throw new Error('Could not open the Stripe verification page on this device.');
    await Linking.openURL(data.url);
  }, []);

  const refreshStripeVerificationStatus = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        setStripeVerificationBusy(true);
        const data = await invokeEdgeFunction('get-stripe-connect-status', {});

        const nextStatus = (data?.status ?? null) as StripeVerificationStatus | null;
        setStripeVerificationStatus(nextStatus);
        return nextStatus;
      } catch (e: any) {
        if (!options?.silent) {
          Alert.alert('Stripe verification', e?.message || 'Could not check Stripe verification right now.');
        }
        return null;
      } finally {
        setStripeVerificationBusy(false);
      }
    },
    [],
  );

  const syncVerificationIdentity = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Please log in again.');
    }

    await saveBaseProfile(user.id, 'trader');

    if (traderMode === 'team') {
      const { error } = await supabase
        .from('team_accounts')
        .update({
          name: tradingName.trim() || businessName.trim() || fullName,
          business_name: businessName.trim() || tradingName.trim() || null,
          company_registration_number: companyRegistrationNumber.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('owner_user_id', user.id);

      if (error && !isMissingStructuredTeamSchemaError(error)) {
        throw error;
      }
    }

    await persistPostAuthDraft('verify_identity');
  }, [
    businessName,
    companyRegistrationNumber,
    fullName,
    persistPostAuthDraft,
    saveBaseProfile,
    traderMode,
    tradingName,
  ]);

  const openStripeVerificationFlow = useCallback(async () => {
    if (!verificationNameValid) {
      Alert.alert(
        'Add your legal name',
        traderMode === 'team'
          ? 'Please check the business name before opening Stripe verification.'
          : 'Please enter your legal first and last name exactly as they appear on your ID.',
      );
      return;
    }

    if (!verificationConfirmed) {
      Alert.alert(
        'Confirm your legal name',
        'Please confirm that the legal name entered here matches the government ID you will provide to Stripe.',
      );
      return;
    }

    try {
      setBusy(true);
      setVerificationConfirmed(true);
      await syncVerificationIdentity();
      await startStripePayoutSetup();
    } catch (e: any) {
      Alert.alert('Verification', e?.message || 'Could not open Stripe verification.');
    } finally {
      setBusy(false);
    }
  }, [startStripePayoutSetup, syncVerificationIdentity, traderMode, verificationConfirmed, verificationNameValid]);

  const handleCreateAccount = useCallback(async () => {
    if (!role) return;

    const selectedRole: AppRole = role;
    const customerName = customerFullName.trim();
    const traderName = fullName;
    const accountName = selectedRole === 'client' ? customerName : traderName;
    const nameParts =
      selectedRole === 'client'
        ? splitName(customerName)
        : traderMode === 'team'
          ? { firstName: '', lastName: '' }
          : { firstName, lastName };
    const preparedDraft: OnboardingDraft = {
      email: normalizedEmail,
      role: selectedRole,
      traderMode,
      fullName: selectedRole === 'client' ? customerName : traderName,
      firstName: nameParts.firstName.trim(),
      lastName: nameParts.lastName.trim(),
      phone: normalizedPhone,
      clientRefCode: clientRefCode.trim().toUpperCase(),
      businessName: businessName.trim(),
      tradingName: tradingName.trim(),
      workAddress: workAddress.trim(),
      postcode: postcode.trim().toUpperCase(),
      companyRegistrationNumber: companyRegistrationNumber.trim(),
      vatRegistered,
      vatRegistrationNumber: vatRegistered ? normalizeVatRegistrationNumber(vatRegistrationNumber) : '',
      teamInviteEmails,
      postAuthScreen: selectedRole === 'client' ? 'customer_welcome' : 'verify_identity',
    };
    let accountCreated = false;

    try {
      setBusy(true);
      await writeOnboardingDraft(preparedDraft);

      const { data: phoneAvailable, error: phoneCheckError } = await supabase.rpc('rpc_phone_available', {
        p_phone: normalizedPhone,
      });
      if (phoneCheckError) {
        throw new Error('Phone verification is temporarily unavailable. Please try again shortly.');
      }
      if (!phoneAvailable) {
        throw new Error('This mobile number is already linked to another account.');
      }

      const { data: signUpRes, error: signUpErr } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            role: selectedRole,
            name: accountName,
            full_name: accountName,
            first_name: nameParts.firstName.trim(),
            last_name: nameParts.lastName.trim(),
            phone: normalizedPhone,
            trader_mode: selectedRole === 'trader' ? traderMode : null,
            business_name: selectedRole === 'trader' ? businessName.trim() || null : null,
            trading_name: selectedRole === 'trader' ? tradingName.trim() || null : null,
            company_registration_number:
              selectedRole === 'trader' ? companyRegistrationNumber.trim() || null : null,
            work_address: selectedRole === 'trader' ? workAddress.trim() || null : null,
            postcode: selectedRole === 'trader' ? postcode.trim().toUpperCase() || null : null,
            vat_registered: selectedRole === 'trader' ? vatRegistered : false,
            vat_registration_number:
              selectedRole === 'trader' && vatRegistered
                ? normalizeVatRegistrationNumber(vatRegistrationNumber)
                : null,
          },
        },
      });
      if (signUpErr) {
        if (!isUserAlreadyExistsError(signUpErr)) {
          throw signUpErr;
        }

        const { data: signInRes, error: signInErr } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInErr) throw signUpErr;

        const recoveredUser = signInRes.user;
        if (!recoveredUser) throw signUpErr;

        accountCreated = true;
        await finishSignedInOnboarding(recoveredUser.id, selectedRole, preparedDraft);
        return;
      }

      const user = signUpRes.user;
      if (!user) throw new Error('Could not create account');
      accountCreated = true;

      if (!signUpRes.session) {
        await writeOnboardingDraft({
          ...preparedDraft,
          userId: user.id,
        });
        Alert.alert(
          'Account created',
          'Your account is ready. Log in now and Yakka will continue your secure setup from where you left off.',
        );
        nav.navigate('Auth');
        return;
      }

      await finishSignedInOnboarding(user.id, selectedRole, preparedDraft);
    } catch (e: any) {
      if (!accountCreated) {
        await clearOnboardingDraft();
      }
      Alert.alert('Sign up error', formatSignUpError(e));
    } finally {
      setBusy(false);
    }
  }, [
    businessName,
    clientRefCode,
    companyRegistrationNumber,
    customerFullName,
    finishSignedInOnboarding,
    firstName,
    fullName,
    lastName,
    nav,
    normalizedEmail,
    password,
    phone,
    role,
    teamInviteEmails,
    traderMode,
    tradingName,
    workAddress,
    postcode,
    vatRegistered,
    vatRegistrationNumber,
  ]);

  const finishCustomerOnboarding = useCallback(async () => {
    try {
      setBusy(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Please log in again.');

      let avatarUrl: string | null = null;
      if (avatarLocalUri) {
        avatarUrl = await uploadAvatar(user.id, avatarLocalUri);
      }

      const patch: any = {
        name: customerFullName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone || null,
        country_code: 'GB',
      };

      if (location.trim()) patch.location = location.trim();
      if (avatarUrl) patch.avatar_url = avatarUrl;

      const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
      if (error) throw error;

      let joinedJobId: string | null = null;
      if (clientRefCode.trim()) {
        const { data, error: joinErr } = await supabase.rpc('join_job_by_ref', {
          p_ref: clientRefCode.trim().toUpperCase(),
        });
        if (!joinErr && data?.id) {
          joinedJobId = data.id;
        }
      }

      await clearOnboardingDraft();
      if (joinedJobId) {
        nav.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: 'JobDetails', params: { jobId: joinedJobId } },
          ],
        });
        return;
      }

      nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (e: any) {
      Alert.alert('Could not finish setup', e.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [avatarLocalUri, clientRefCode, customerFullName, location, nav, normalizedEmail, phone]);

  const finishTraderOnboarding = useCallback(async () => {
    try {
      setBusy(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Please log in again.');

      let avatarUrl: string | null = null;
      if (avatarLocalUri) {
        avatarUrl = await uploadAvatar(user.id, avatarLocalUri);
      }

      let accreditationDocumentPath: string | null = null;
      let accreditationUploadWarning: string | null = null;
      if (traderMode === 'team' && accreditationLocalUri) {
        try {
          accreditationDocumentPath = await uploadProfileDocument(user.id, accreditationLocalUri);
        } catch (uploadError: any) {
          accreditationUploadWarning =
            'Your account was created, but the accreditation document could not be uploaded yet. You can add it again from your profile after the server update.';
          console.warn('Accreditation upload deferred:', uploadError?.message || uploadError);
        }
      }

      const generatedBio =
        traderMode === 'team'
          ? `${tradingName.trim() || businessName.trim() || fullName} is ready to quote securely through Yakka.`
          : `${tradingName.trim() || fullName} is ready to quote securely through Yakka.`;

      const basePatch: any = {
        role: 'trader',
        name: fullName,
        email: normalizedEmail,
        phone: normalizedPhone || null,
        country_code: 'GB',
        location: location.trim() || postcode.trim().toUpperCase() || null,
        tags,
        bio: generatedBio,
      };
      const enhancedPatch: any = {
        ...basePatch,
        trader_mode: traderMode,
        business_accreditations: accreditationDocumentPath ? ['Accreditation document on file'] : [],
        vat_registered: vatRegistered,
        vat_registration_number: vatRegistered ? normalizeVatRegistrationNumber(vatRegistrationNumber) : null,
      };

      if (avatarUrl) {
        basePatch.avatar_url = avatarUrl;
        enhancedPatch.avatar_url = avatarUrl;
      }

      const { error } = await supabase.from('profiles').update(enhancedPatch).eq('id', user.id);
      if (error) {
        if (!isMissingTradieProfileSchemaError(error)) throw error;
        const { error: fallbackError } = await supabase.from('profiles').update(basePatch).eq('id', user.id);
        if (fallbackError) throw fallbackError;
      }

      if (traderMode === 'team') {
        const teamAccountId = await ensureTeamAccount(user.id);
        if (teamAccountId && accreditationDocumentPath) {
          const { error: accreditationError } = await supabase
            .from('team_accounts')
            .update({ accreditation_document_path: accreditationDocumentPath })
            .eq('id', teamAccountId);
          if (accreditationError) {
            const message = String(accreditationError.message || '').toLowerCase();
            if (!message.includes('accreditation_document_path') && !message.includes('schema cache')) {
              throw accreditationError;
            }
            accreditationUploadWarning =
              'Your account was created, but the accreditation document could not be linked yet. You can add it again from your profile after the server update.';
          }
        }
        await saveTeamInvites(user.id, teamAccountId);
      }

      await clearOnboardingDraft();
      nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      if (accreditationUploadWarning) Alert.alert('Accreditation saved later', accreditationUploadWarning);
    } catch (e: any) {
      Alert.alert('Could not finish setup', e.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [
    accreditationLocalUri,
    avatarLocalUri,
    businessName,
    ensureTeamAccount,
    fullName,
    location,
    nav,
    normalizedEmail,
    phone,
    postcode,
    saveTeamInvites,
    tags,
    traderMode,
    tradingName,
    vatRegistered,
    vatRegistrationNumber,
  ]);

  const continuePostAuth = useCallback(
    async (nextScreen: Screen, draftScreen: PostAuthScreen) => {
      setScreen(nextScreen);
      await persistPostAuthDraft(draftScreen);
    },
    [persistPostAuthDraft],
  );

  useEffect(() => {
    if (!isAuthenticated || role !== 'trader') return;
    if (screen !== 'verify_identity' && screen !== 'verification_pending') return;
    void refreshStripeVerificationStatus({ silent: true });
  }, [isAuthenticated, refreshStripeVerificationStatus, resolvedConnectIntent, role, screen]);

  useEffect(() => {
    if (!resolvedConnectIntent || !isAuthenticated || role !== 'trader') return;
    if (lastHandledStripeIntentRef.current === resolvedConnectIntent) return;

    lastHandledStripeIntentRef.current = resolvedConnectIntent;
    let active = true;

    (async () => {
      if (resolvedConnectIntent === 'refresh') {
        try {
          await startStripePayoutSetup();
        } catch (e: any) {
          if (active) Alert.alert('Stripe verification', e?.message || 'Could not reopen the Stripe verification page.');
        }
        return;
      }

      const status = await refreshStripeVerificationStatus({ silent: true });
      if (!active || !status) return;
      const statusNeedsMoreInfo =
        !!status.disabledReason ||
        status.currentlyDue.length > 0 ||
        status.pastDue.length > 0 ||
        status.errors.length > 0;

      if (status.payoutsEnabled) {
        await continuePostAuth('verification_pending', 'verification_pending');
        if (active) {
          Alert.alert(
            'Verification complete',
            'Stripe has verified the payout account. You can now complete the rest of the profile.',
          );
        }
        return;
      }

      if (!statusNeedsMoreInfo && (status.detailsSubmitted || status.pendingVerification.length > 0)) {
        await continuePostAuth('verification_pending', 'verification_pending');
        if (active) {
          Alert.alert(
            'Verification submitted',
            'Stripe has received the ID details and is reviewing them now.',
          );
        }
        return;
      }

      setScreen('verify_identity');
      await persistPostAuthDraft('verify_identity');

      if (!active) return;

      if (hasStripeNameMismatch(status)) {
        Alert.alert(
          'Name mismatch',
          'The legal first and last name on the ID must exactly match the name entered on this Yakka account.',
        );
        return;
      }

      if (statusNeedsMoreInfo) {
        Alert.alert(
          'More information needed',
          stripeRequiredFieldsPreview
            ? `Stripe still needs: ${stripeRequiredFieldsPreview}.`
            : 'Stripe needs a little more information before this account can be approved.',
        );
        return;
      }

      Alert.alert(
        'Stripe verification not finished',
        'Please reopen Stripe and finish the secure ID check before continuing.',
      );
    })();

    return () => {
      active = false;
    };
  }, [
    continuePostAuth,
    isAuthenticated,
    persistPostAuthDraft,
    refreshStripeVerificationStatus,
    resolvedConnectIntent,
    role,
    startStripePayoutSetup,
    stripeRequiredFieldsPreview,
  ]);

  const addInviteEmail = useCallback(() => {
    const next = teamInviteInput.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) {
      Alert.alert('Check email', 'Please enter a valid team member email address.');
      return;
    }
    if (teamInviteEmails.includes(next)) {
      setTeamInviteInput('');
      return;
    }
    setTeamInviteEmails(prev => [...prev, next]);
    setTeamInviteInput('');
  }, [teamInviteEmails, teamInviteInput]);

  if (hydrating) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScreenState loading title="Preparing sign up" />
      </View>
    );
  }

  const footerRow = (left: React.ReactNode, right: React.ReactNode) => (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>{left}</View>
      <View style={{ flex: 1 }}>{right}</View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <BrandHeaderBar
        topInset={insets.top}
        horizontalPadding={screenGutter}
        verticalPadding={12}
        curvedBottom
      />
      {!isAuthenticated && (
        <PageBackHeader
          onBack={() => { void goBack(); }}
          title={route.name === 'Join' ? 'Join job' : 'Create account'}
        />
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: screenGutter, paddingTop: 16, paddingBottom: 40 }}
      >
        {screen === 'role' && (
          <Shell
            screenLabel="Sign up"
            headline="Choose your account type"
            subtitle="Are you a customer or a tradie?"
          >
            <View style={{ gap: 12 }}>
              <PrimaryButton
                label="Customer"
                onPress={() => {
                  setRole('client');
                  setTraderMode(null);
                  setScreen('customer_account');
                }}
              />
              <Text variant="headlineSmall" style={{ textAlign: 'center', color: theme.colors.onSurface }}>
                or
              </Text>
              <SecondaryButton
                label="Tradie"
                onPress={() => {
                  setRole('trader');
                  setTraderMode(null);
                  setScreen('trader_mode');
                }}
              />
            </View>
          </Shell>
        )}

        {screen === 'trader_mode' && (
          <Shell
            screenLabel="Sign up"
            headline="Tell us how you work"
            subtitle="What type of business do you have?"
          >
            <View style={{ gap: 12 }}>
              <PrimaryButton
                label="I work on my own"
                onPress={() => {
                  setTraderMode('solo');
                  setScreen('trader_account');
                }}
              />
              <Text variant="headlineSmall" style={{ textAlign: 'center', color: theme.colors.onSurface }}>
                or
              </Text>
              <SecondaryButton
                label="I have a team"
                onPress={() => {
                  setTraderMode('team');
                  setScreen('trader_account');
                }}
              />
              {!!traderMode && (
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                  {traderMode === 'solo'
                    ? 'Use this if you quote and complete jobs yourself.'
                    : 'Use this if one account owner controls jobs, payouts, and invited team members.'}
                </Text>
              )}
            </View>
          </Shell>
        )}

        {screen === 'customer_account' && (
          <Shell
            headline="Create account"
          >
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  mode="outlined"
                  label="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  style={{ flex: 1 }}
                />
                <TextInput
                  mode="outlined"
                  label="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  style={{ flex: 1 }}
                />
              </View>
              <TextInput
                mode="outlined"
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                error={!!email && !emailValid}
              />
              {!!email && !emailValid && <HelperText type="error">Please enter a valid email address.</HelperText>}
              <TextInput
                mode="outlined"
                label="Mobile number"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                error={!!phone && !phoneValid}
              />
              {!!phone && !phoneValid && <HelperText type="error">Enter a valid UK mobile number.</HelperText>}
              <TextInput
                mode="outlined"
                label="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                error={!!password && !passwordValid}
              />
              <TextInput
                mode="outlined"
                label="Confirm password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={!!confirmPassword && !passwordsMatch}
              />
              {!!password && !passwordValid && (
                <HelperText type="error">
                  Use at least 6 characters, including uppercase, lowercase, a number, and a symbol.
                </HelperText>
              )}
              {!!confirmPassword && !passwordsMatch && <HelperText type="error">Passwords do not match.</HelperText>}
              <PrimaryButton
                label="Create account"
                onPress={handleCreateAccount}
                disabled={!customerAccountValid || busy}
                loading={busy}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Checkbox status={acceptTerms ? 'checked' : 'unchecked'} onPress={() => setAcceptTerms(value => !value)} />
                <Text
                  variant="bodyMedium"
                  style={{ flex: 1, color: theme.colors.onSurface }}
                  onPress={() => nav.navigate('StaticInfo', { kind: 'terms' })}
                >
                  Accept terms & conditions
                </Text>
              </View>
            </View>
          </Shell>
        )}

        {screen === 'trader_account' && (
          <Shell
            screenLabel={undefined}
            headline="Create account"
            footer={<PrimaryButton label="Continue" onPress={() => setScreen('trader_business')} disabled={!traderAccountValid} />}
          >
            <View style={{ gap: 12 }}>
              {traderMode === 'team' ? (
                <TextInput mode="outlined" label="Business name" value={tradingName} onChangeText={setTradingName} />
              ) : (
                <>
                  <TextInput mode="outlined" label="First name" value={firstName} onChangeText={setFirstName} />
                  <TextInput mode="outlined" label="Last name" value={lastName} onChangeText={setLastName} />
                </>
              )}
              <TextInput
                mode="outlined"
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                error={!!email && !emailValid}
              />
              {!!email && !emailValid && <HelperText type="error">Please enter a valid email address.</HelperText>}
              <TextInput
                mode="outlined"
                label="Mobile number"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                error={!!phone && !phoneValid}
              />
              {!!phone && !phoneValid && <HelperText type="error">Enter a valid UK mobile number.</HelperText>}
            </View>
          </Shell>
        )}

        {screen === 'trader_business' && (
          <Shell
            screenLabel="sign up"
            headline="Enter your business details"
            footer={
              <PrimaryButton
                label="Continue"
                onPress={() => setScreen('trader_password')}
                disabled={
                  (traderMode === 'team'
                    ? !businessName.trim() || !workAddress.trim() || !postcode.trim()
                    : !workAddress.trim() || !postcode.trim()) ||
                  (vatRegistered && !isValidVatRegistrationNumber(vatRegistrationNumber))
                }
              />
            }
          >
            <View style={{ gap: 12 }}>
              {traderMode === 'team' ? (
                <>
                  <TextInput mode="outlined" label="Registered business name" value={businessName} onChangeText={setBusinessName} />
                  <TextInput
                    mode="outlined"
                    label="Company registration number"
                    value={companyRegistrationNumber}
                    onChangeText={setCompanyRegistrationNumber}
                  />
                  <Button
                    mode="text"
                    onPress={() =>
                      Linking.openURL('https://find-and-update.company-information.service.gov.uk/')
                    }
                    textColor={theme.colors.onSurface}
                  >
                    Where do I find this?
                  </Button>
                </>
              ) : (
                <TextInput
                  mode="outlined"
                  label="Trading name"
                  value={tradingName}
                  onChangeText={setTradingName}
                  placeholder="If you do not trade under a business name, enter your own name"
                />
              )}

              <TextInput mode="outlined" label={traderMode === 'team' ? 'Address' : 'Work address'} value={workAddress} onChangeText={setWorkAddress} />
              <TextInput
                mode="outlined"
                label="Postcode"
                value={postcode}
                onChangeText={text => setPostcode(text.toUpperCase())}
              />

              <Card mode="outlined" style={{ borderRadius: 20, marginTop: 4 }}>
                <Card.Content style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleMedium">VAT registered?</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{vatRegistered ? 'Yes' : 'No'}</Text>
                    </View>
                    <IconButton icon="information-outline" size={20} onPress={() => setVatInfoOpen(value => !value)} />
                    <BrandSwitch value={vatRegistered} onValueChange={setVatRegistered} accessibilityLabel="VAT registered" />
                  </View>

                  {vatRegistered && (
                    <>
                      <TextInput
                        mode="outlined"
                        label="VAT registration number"
                        placeholder="e.g. GB 123 4567 89"
                        autoCapitalize="characters"
                        value={vatRegistrationNumber}
                        onChangeText={setVatRegistrationNumber}
                        onBlur={() => setVatRegistrationNumber(normalizeVatRegistrationNumber(vatRegistrationNumber))}
                        error={!!vatRegistrationNumber && !isValidVatRegistrationNumber(vatRegistrationNumber)}
                      />
                      {!!vatRegistrationNumber && !isValidVatRegistrationNumber(vatRegistrationNumber) && (
                        <HelperText type="error">Enter a valid UK VAT registration number.</HelperText>
                      )}
                    </>
                  )}

                  {vatInfoOpen && (
                    <View style={{ gap: 8, borderRadius: 16, padding: 14, backgroundColor: theme.colors.surfaceVariant }}>
                      <Text variant="titleMedium">What is VAT registration?</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                        If your total business turnover exceeds £90,000 in any 12-month period, you are legally required to register for VAT with HMRC.
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                        If you&apos;re VAT registered, Yakka will automatically add 20% VAT to your quotes. Your customers will see the VAT broken out clearly, along with your VAT number so they can verify it.
                      </Text>
                      <Button mode="text" icon="open-in-new" onPress={() => Linking.openURL(VAT_REGISTRATION_URL)}>
                        gov.uk/vat-registration
                      </Button>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                        You can update your VAT status at any time in your profile settings.
                      </Text>
                    </View>
                  )}
                </Card.Content>
              </Card>
            </View>
          </Shell>
        )}

        {screen === 'trader_password' && (
          <Shell
            screenLabel={undefined}
            headline="Create account"
            footer={
              <PrimaryButton
                label="Continue"
                onPress={handleCreateAccount}
                disabled={!traderPasswordValid || busy}
                loading={busy}
              />
            }
          >
            <View style={{ gap: 12 }}>
              <TextInput
                mode="outlined"
                label="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                error={!!password && !passwordValid}
              />
              <TextInput
                mode="outlined"
                label="Confirm password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={!!confirmPassword && !passwordsMatch}
              />
              {!!password && !passwordValid && (
                <HelperText type="error">
                  Use at least 6 characters, including uppercase, lowercase, a number, and a symbol.
                </HelperText>
              )}
              {!!confirmPassword && !passwordsMatch && <HelperText type="error">Passwords do not match.</HelperText>}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Checkbox status={acceptTerms ? 'checked' : 'unchecked'} onPress={() => setAcceptTerms(value => !value)} />
                <Text
                  variant="bodyMedium"
                  style={{ flex: 1, color: theme.colors.onSurface }}
                  onPress={() => nav.navigate('StaticInfo', { kind: 'terms' })}
                >
                  Accept terms & conditions
                </Text>
              </View>
            </View>
          </Shell>
        )}

        {screen === 'customer_welcome' && (
          <Shell
            screenLabel="Welcome"
            headline={`Welcome ${customerFullName.split(' ')[0] || 'there'}!`}
            footer={
              avatarLocalUri || location.trim()
                ? footerRow(
                    <Button mode="text" onPress={finishCustomerOnboarding} textColor={theme.colors.onSurface} disabled={busy}>
                      Skip
                    </Button>,
                    <PrimaryButton label="Next" onPress={finishCustomerOnboarding} disabled={busy} loading={busy} />,
                  )
                : <PrimaryButton label="Skip" onPress={finishCustomerOnboarding} disabled={busy} loading={busy} />
            }
          >
            <View style={{ gap: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {avatarLocalUri ? <Avatar.Image size={72} source={{ uri: avatarLocalUri }} /> : <Avatar.Icon size={72} icon="account" />}
                <View style={{ flex: 1, gap: 8 }}>
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                    Upload profile image (optional)
                  </Text>
                  <SecondaryButton label={avatarLocalUri ? 'Change image' : 'Upload'} onPress={() => pickImage('avatar')} />
                </View>
              </View>

              <LocationInput label="Add location (optional)" value={location} onChangeText={setLocation} placeholder="Town or postcode" />
            </View>
          </Shell>
        )}

        {screen === 'verify_identity' && (
          <Shell
            screenLabel="sign up"
            headline={traderMode === 'team' ? 'Verify identity' : 'Verify your identity'}
            subtitle={
              traderMode === 'team'
                ? 'Stripe will verify one managing director or authorised representative for this business before Yakka can release payouts.'
                : 'Stripe will securely collect your government ID and check that the legal name matches the one on this Yakka account.'
            }
            footer={<PrimaryButton
              label={stripeVerificationSubmitted ? 'Next' : 'Open Stripe'}
              onPress={async () => {
                if (stripeVerificationSubmitted) {
                  await continuePostAuth('verification_pending', 'verification_pending');
                  return;
                }
                await openStripeVerificationFlow();
              }}
              disabled={busy || stripeVerificationBusy || !verificationConfirmed}
              loading={busy}
            />}
          >
            <View style={{ gap: 14 }}>
              <Card mode="contained" style={{ borderRadius: 24, backgroundColor: theme.colors.surfaceVariant }}>
                <Card.Content style={{ gap: 8 }}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                    {stripeVerificationHeadline}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                    {stripeVerificationBody}
                  </Text>
                </Card.Content>
              </Card>

              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                Account name: {fullName || 'Not set'}
              </Text>

              {traderMode === 'solo' ? (
                <View style={{ gap: 12 }}>
                  <TextInput
                    mode="outlined"
                    label="Legal first name"
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                  />
                  <TextInput
                    mode="outlined"
                    label="Legal last name"
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                  />
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  <TextInput
                    mode="outlined"
                    label="Business name"
                    value={businessName}
                    onChangeText={setBusinessName}
                    autoCapitalize="words"
                  />
                  <TextInput
                    mode="outlined"
                    label="Trading name"
                    value={tradingName}
                    onChangeText={setTradingName}
                    autoCapitalize="words"
                  />
                </View>
              )}

              {traderMode === 'solo' && (
                <TextInput
                  mode="outlined"
                  label="Company registration number (if applicable)"
                  value={companyRegistrationNumber}
                  onChangeText={setCompanyRegistrationNumber}
                />
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Checkbox
                  status={verificationConfirmed ? 'checked' : 'unchecked'}
                  onPress={() => setVerificationConfirmed(value => !value)}
                />
                <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurface }}>
                  I confirm the legal name on my ID matches this account
                </Text>
              </View>

              <View style={{ gap: 10 }}>
                <SecondaryButton
                  label={stripeNeedsMoreInfo ? 'Open Stripe again' : 'Upload ID'}
                  onPress={openStripeVerificationFlow}
                  disabled={busy || stripeVerificationBusy || !verificationConfirmed}
                />
                <Button
                  mode="text"
                  onPress={() => void refreshStripeVerificationStatus()}
                  disabled={stripeVerificationBusy}
                  textColor={theme.colors.onSurface}
                >
                  {stripeVerificationBusy ? 'Checking Stripe...' : 'Check Stripe status'}
                </Button>
              </View>
            </View>
          </Shell>
        )}

        {screen === 'verification_pending' && (
          <Shell
            screenLabel="sign up"
            headline={stripeNeedsMoreInfo ? 'Action needed' : 'Thanks!'}
            subtitle={
              stripeVerificationStatus?.payoutsEnabled
                ? 'Stripe has verified the payout account. You can finish the rest of the profile now.'
                : stripeNeedsMoreInfo
                  ? 'Stripe needs a little more information before this account can be approved.'
                  : 'Stripe is reviewing the identity and payout details. You can continue once payouts are enabled.'
            }
            footer={
              stripeNeedsMoreInfo
                ? footerRow(
                    <Button
                      mode="text"
                      onPress={async () => {
                        await continuePostAuth('verify_identity', 'verify_identity');
                      }}
                      textColor={theme.colors.onSurface}
                    >
                      Back
                    </Button>,
                    <PrimaryButton
                      label="Open Stripe again"
                      onPress={openStripeVerificationFlow}
                      disabled={busy || stripeVerificationBusy || !verificationConfirmed}
                      loading={busy}
                    />,
                  )
                : stripeVerificationStatus?.payoutsEnabled
                  ? footerRow(
                    <Button
                      mode="text"
                      onPress={() => void refreshStripeVerificationStatus()}
                      textColor={theme.colors.onSurface}
                      disabled={stripeVerificationBusy}
                    >
                      {stripeVerificationBusy ? 'Checking...' : 'Check status'}
                    </Button>,
                    <PrimaryButton
                      label="Complete profile"
                      onPress={async () => {
                        await continuePostAuth('profile_trades', 'profile_trades');
                      }}
                    />,
                  )
                  : footerRow(
                    <Button
                      mode="text"
                      onPress={() => void refreshStripeVerificationStatus()}
                      textColor={theme.colors.onSurface}
                      disabled={stripeVerificationBusy}
                    >
                      {stripeVerificationBusy ? 'Checking...' : 'Check status'}
                    </Button>,
                    <PrimaryButton
                      label="Open Stripe again"
                      onPress={openStripeVerificationFlow}
                      disabled={busy || stripeVerificationBusy || !verificationConfirmed}
                      loading={busy}
                    />,
                  )
            }
          >
            <View style={{ gap: 14 }}>
              <Card mode="contained" style={{ borderRadius: 24, backgroundColor: theme.colors.surfaceVariant }}>
                <Card.Content style={{ gap: 8 }}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                    {stripeVerificationHeadline}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                    {stripeVerificationBody}
                  </Text>
                </Card.Content>
              </Card>
              {!!stripeRequiredFieldsPreview && stripeNeedsMoreInfo && (
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  Outstanding items: {stripeRequiredFieldsPreview}
                </Text>
              )}
            </View>
          </Shell>
        )}

        {screen === 'profile_trades' && (
          <Shell
            screenLabel="sign up"
            headline="Complete your profile"
            progress={{ step: 1, total: traderMode === 'team' ? 5 : 3 }}
            footer={footerRow(
              <Button mode="text" onPress={() => setScreen('verification_pending')} textColor={theme.colors.onSurface}>
                BACK
              </Button>,
              <PrimaryButton
                label="Continue"
                onPress={async () => {
                  if (!tags.length) {
                    Alert.alert('Select at least one trade', 'Choose the main trade areas you want customers to see.');
                    return;
                  }
                  await continuePostAuth('profile_location', 'profile_location');
                }}
              />,
            )}
          >
            <View style={{ gap: 12 }}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, }}>
                Select your main trade/s
              </Text>
              <TextInput mode="outlined" label="Search" value={tradeQuery} onChangeText={setTradeQuery} />
              <View style={{ gap: 8 }}>
                {filteredTags.map(tag => {
                  const selected = tags.includes(tag);
                  return (
                    <Button
                      key={tag}
                      mode={selected ? 'contained' : 'contained-tonal'}
                      onPress={() =>
                        setTags(prev => (prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]))
                      }
                      buttonColor={selected ? BRAND_COLORS.orange : undefined}
                      textColor={selected ? BRAND_COLORS.white : theme.colors.onSurface}
                      style={{ justifyContent: 'flex-start', borderRadius: 18 }}
                      contentStyle={{ justifyContent: 'space-between', paddingVertical: 6 }}
                      icon={selected ? 'check-circle' : 'circle-outline'}
                    >
                      {tag}
                    </Button>
                  );
                })}
              </View>
            </View>
          </Shell>
        )}

        {screen === 'profile_location' && (
          <Shell
            screenLabel="sign up"
            headline="Complete your profile"
            progress={{ step: 2, total: traderMode === 'team' ? 5 : 3 }}
            footer={footerRow(
              <Button mode="text" onPress={() => setScreen('profile_trades')} textColor={theme.colors.onSurface}>
                BACK
              </Button>,
              traderMode === 'team' ? (
                <SecondaryButton
                  label="Skip for now"
                  onPress={async () => continuePostAuth('profile_accreditations', 'profile_accreditations')}
                />
              ) : (
                <SecondaryButton
                  label="Skip for now"
                  onPress={async () => continuePostAuth('profile_avatar', 'profile_avatar')}
                />
              ),
            )}
          >
            <View style={{ gap: 12 }}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, }}>
                Tell us where you work
              </Text>
              <LocationInput label="Work area" value={location} onChangeText={setLocation} placeholder="City, county, or postcode" />
              <PrimaryButton
                label="Continue"
                onPress={async () => {
                  if (traderMode === 'team') {
                    await continuePostAuth('profile_accreditations', 'profile_accreditations');
                    return;
                  }
                  await continuePostAuth('profile_avatar', 'profile_avatar');
                }}
                disabled={!location.trim()}
              />
            </View>
          </Shell>
        )}

        {screen === 'profile_accreditations' && (
          <Shell
            screenLabel="sign up"
            headline="Complete your profile"
            progress={{ step: 3, total: 5 }}
            footer={footerRow(
              <Button mode="text" onPress={() => setScreen('profile_location')} textColor={theme.colors.onSurface}>
                BACK
              </Button>,
              <SecondaryButton
                label="Skip for now"
                onPress={async () => continuePostAuth('profile_avatar', 'profile_avatar')}
              />,
            )}
          >
            <View style={{ gap: 12 }}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 30 }}>
                Does your business hold any accreditations?
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                Upload certifications or licences that apply to your business.
              </Text>
              <SecondaryButton
                label="Upload"
                onPress={() => pickImage('accreditation')}
              />
              <PrimaryButton
                label="Continue"
                onPress={async () => continuePostAuth('profile_avatar', 'profile_avatar')}
                disabled={!accreditationLocalUri}
              />
            </View>
          </Shell>
        )}

        {screen === 'profile_avatar' && (
          <Shell
            screenLabel="sign up"
            headline="Complete your profile"
            progress={{ step: traderMode === 'team' ? 4 : 3, total: traderMode === 'team' ? 5 : 3 }}
            footer={footerRow(
              <Button
                mode="text"
                onPress={() => setScreen(traderMode === 'team' ? 'profile_accreditations' : 'profile_location')}
                textColor={theme.colors.onSurface}
              >
                BACK
              </Button>,
              traderMode === 'team' ? (
                <PrimaryButton
                  label="Continue"
                  onPress={async () => continuePostAuth('team_members', 'team_members')}
                />
              ) : (
                <PrimaryButton label="Complete" onPress={finishTraderOnboarding} disabled={busy} loading={busy} />
              ),
            )}
          >
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {avatarLocalUri ? (
                  <Avatar.Image size={76} source={{ uri: avatarLocalUri }} />
                ) : (
                  <Avatar.Icon size={76} icon={traderMode === 'team' ? 'office-building' : 'account'} />
                )}
                <View style={{ flex: 1, gap: 8 }}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 28 }}>
                    {traderMode === 'team' ? 'Upload profile picture or company logo' : 'Upload profile picture'}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                    This will be visible to customers.
                  </Text>
                </View>
              </View>

              <SecondaryButton
                label="Upload"
                onPress={() => pickImage('avatar')}
              />
            </View>
          </Shell>
        )}

        {screen === 'team_members' && (
          <Shell
            screenLabel="sign up"
            headline="Complete your profile"
            progress={{ step: 5, total: 5 }}
            footer={footerRow(
              <Button mode="text" onPress={() => setScreen('profile_avatar')} textColor={theme.colors.onSurface}>
                BACK
              </Button>,
              <SecondaryButton label="Skip for now" onPress={finishTraderOnboarding} disabled={busy} />,
            )}
          >
            <View style={{ gap: 12 }}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, }}>
                Add team members
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 24 }}>
                Invite team members to view and update jobs. They can message customers, upload updates, and mark jobs complete, but they cannot change pricing, payments, or settings.
              </Text>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  mode="outlined"
                  label="Enter Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={teamInviteInput}
                  onChangeText={setTeamInviteInput}
                  style={{ flex: 1 }}
                />
                <PrimaryButton label="Add" onPress={addInviteEmail} disabled={!teamInviteInput.trim()} />
              </View>

              <View style={{ gap: 8 }}>
                {teamInviteEmails.map(entry => (
                  <Card key={entry} mode="outlined" style={{ borderRadius: 18 }}>
                    <Card.Content style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
                      <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
                        {entry}
                      </Text>
                      <Button
                        mode="contained"
                        compact
                        buttonColor={BRAND_COLORS.orangeSoft}
                        textColor={BRAND_COLORS.orange}
                        onPress={() => setTeamInviteEmails(prev => prev.filter(item => item !== entry))}
                      >
                        Invited
                      </Button>
                    </Card.Content>
                  </Card>
                ))}
              </View>

              <PrimaryButton
                label="Continue"
                onPress={finishTraderOnboarding}
                disabled={!teamInviteEmails.length || busy}
                loading={busy}
              />
            </View>
          </Shell>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function Onboarding() {
  return <OnboardingContent />;
}
