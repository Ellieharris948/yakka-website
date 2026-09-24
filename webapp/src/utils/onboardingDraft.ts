import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppRole = 'client' | 'trader';
export type TraderMode = 'solo' | 'team';
export type PostAuthScreen =
  | 'customer_welcome'
  | 'verify_identity'
  | 'verification_pending'
  | 'profile_trades'
  | 'profile_location'
  | 'profile_accreditations'
  | 'profile_avatar'
  | 'team_members';

export type OnboardingDraft = {
  email: string;
  role: AppRole;
  traderMode?: TraderMode | null;
  userId?: string | null;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  clientRefCode?: string;
  businessName?: string;
  tradingName?: string;
  workAddress?: string;
  postcode?: string;
  companyRegistrationNumber?: string;
  vatRegistered?: boolean;
  vatRegistrationNumber?: string;
  tags?: string[];
  location?: string;
  bio?: string;
  teamInviteEmails?: string[];
  avatarLocalUri?: string | null;
  accreditationLocalUri?: string | null;
  idDocumentLocalUri?: string | null;
  postAuthScreen?: PostAuthScreen;
};

const STORAGE_KEY = 'yakka:onboarding-draft';

export async function readOnboardingDraft(): Promise<OnboardingDraft | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export async function writeOnboardingDraft(draft: OnboardingDraft) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export async function clearOnboardingDraft() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
