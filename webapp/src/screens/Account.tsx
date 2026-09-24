// src/screens/Account.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, ScrollView, ActivityIndicator, Pressable, Share, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MCIcon from '../components/BrandIcon';
import Svg, { Circle } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { ensureMyProfile } from '../api/profile';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  List,
  Text,
  TextInput,
  useTheme,
} from '../ui/paper';
import { pickProfileImage, uploadAvatar } from '../utils/avatar';
import LocationInput from '../components/LocationInput';
import { BRAND_COLORS } from '../theme';
import BrandScreenFrame from '../components/BrandScreenFrame';
import { formatGBPCents } from '../utils/money';
import SettingsScreen from './Settings';
import { BRAND_CONTENT_MAX_WIDTH, getResponsiveScreenGutter } from '../utils/layout';
import ScreenState from '../components/ScreenState';

const TAG_OPTIONS = [
  'Builder', 'Painter & Decorator', 'Plumber', 'Electrician', 'Carpenter & Joiner',
  'Plasterer', 'Bricklayer', 'Roofer', 'Tiler', 'Flooring specialist', 'Kitchen fitter',
  'Bathroom fitter', 'Gas engineer', 'Heating engineer', 'Drainage specialist',
  'Landscaper', 'Gardener', 'Fencer', 'Tree surgeon', 'Cleaner', 'Handyperson',
  'Locksmith', 'Glazier', 'Welder', 'Scaffolder', 'Damp specialist',
  'Air conditioning engineer', 'Solar installer', 'Security installer',
];

type Role = 'client' | 'trader' | 'admin' | null;
type Profile = {
  id: string;
  name: string | null;
  role: Role;
  email?: string | null;
  avatar_url?: string | null;
  location?: string | null;
  bio?: string | null;
  tags?: string[] | null;
  trader_mode?: 'solo' | 'team' | null;
  qualifications?: string[] | null;
  business_accreditations?: string[] | null;
  public_liability_insurance?: string | null;
};

type TeamAccount = {
  id: string;
  owner_user_id: string;
  name: string;
  business_name: string | null;
  trading_name: string | null;
  verification_status: string | null;
};

type ReviewRow = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  job: { id: string; title: string | null; end_date: string | null } | null;
};

function isoToDMY(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB');
  } catch {
    return '—';
  }
}

export default function Account({ route }: any) {
  const nav = useNavigation<any>();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const screenGutter = getResponsiveScreenGutter(width);
  const viewingUserId: string | undefined = route?.params?.userId;
  const publicView: boolean = !!route?.params?.publicView;

  const [me, setMe] = useState<Profile | null>(null);
  const [subject, setSubject] = useState<Profile | null>(null); // whose profile is being viewed
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teamAccount, setTeamAccount] = useState<TeamAccount | null>(null);
  const [authTraderMode, setAuthTraderMode] = useState<'solo' | 'team' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // editable fields (trader)
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [skillQuery, setSkillQuery] = useState('');
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [qualificationInput, setQualificationInput] = useState('');
  const [businessAccreditations, setBusinessAccreditations] = useState<string[]>([]);
  const [publicLiabilityInsurance, setPublicLiabilityInsurance] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const isOwnProfile = useMemo(() => !!me && !!subject && me.id === subject.id, [me, subject]);
  const isTrader = subject?.role === 'trader';
  const isClient = subject?.role === 'client';
  const isAdmin = me?.role === 'admin';
  const showSettingsCog = isOwnProfile && !publicView;

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const metadataMode = user.user_metadata?.trader_mode;
      setAuthTraderMode(metadataMode === 'team' ? 'team' : metadataMode === 'solo' ? 'solo' : null);

      // Me (can include email), synced with auth metadata so role stays correct.
      const meRes = await ensureMyProfile();
      setMe(meRes as Profile | null);

      // Whose profile are we showing?
      const profileId = viewingUserId || user.id;

      // Subject (public fields if not self)
      if (profileId === user.id) {
        setSubject(meRes as Profile | null);
      } else {
        const enhancedSubjectRead = await supabase
          .from('profiles')
          .select('id, name, role, avatar_url, location, bio, tags, trader_mode, qualifications, business_accreditations, public_liability_insurance')
          .eq('id', profileId)
          .maybeSingle();
        const fallbackSubjectRead = enhancedSubjectRead.error
          ? await supabase
              .from('profiles')
              .select('id, name, role, avatar_url, location, bio, tags')
              .eq('id', profileId)
              .maybeSingle()
          : null;
        setSubject(((fallbackSubjectRead?.data ?? enhancedSubjectRead.data) as Profile) || null);
      }

      // Fetch trader reviews + past jobs (only completed jobs, only visible reviews)
      // We alias the relation as "job" and inner-join to ensure a job row exists,
      // then filter to job.status = 'completed'.
      const revieweeId = profileId;
      const { data: roleProbe } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', revieweeId)
        .maybeSingle();

      if (roleProbe?.role === 'trader') {
        const { data: teamRow } = await supabase
          .from('team_accounts')
          .select('id,owner_user_id,name,business_name,trading_name,verification_status')
          .eq('owner_user_id', revieweeId)
          .maybeSingle();
        setTeamAccount((teamRow as TeamAccount | null) || null);

        // Prefill editable fields for traders
        const subjForEdits = revieweeId === user.id
          ? (meRes as Profile | null)
          : (await supabase.from('profiles').select('location, bio, tags, public_liability_insurance').eq('id', revieweeId).maybeSingle()).data as Profile | null;

        if (subjForEdits) {
          setLocation(subjForEdits.location || '');
          setBio(subjForEdits.bio || '');
          setTags(subjForEdits.tags || []);
          setQualifications(subjForEdits.qualifications || []);
          setBusinessAccreditations(subjForEdits.business_accreditations || []);
          setPublicLiabilityInsurance(subjForEdits.public_liability_insurance || '');
        }

        const { data: revs, error: revErr } = await supabase
          .from('reviews')
          .select(`
            id,
            stars,
            comment,
            created_at,
            job:jobs!inner (
              id,
              title,
              end_date,
              status
            )
          `)
          .eq('reviewee_id', revieweeId)
          .eq('hidden', false)
          .eq('job.status', 'completed')
          .order('created_at', { ascending: false });

        if (revErr) throw revErr;
        setReviews((revs || []) as any);

      } else {
        setReviews([]);
        setTeamAccount(null);
      }

      setLoading(false);
    })();
  }, [viewingUserId, publicView]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      if (publicView || viewingUserId) return undefined;

      let active = true;
      void (async () => {
        const profile = (await ensureMyProfile()) as Profile | null;
        if (!profile?.id) return;

        const { data: teamRow } = await supabase
          .from('team_accounts')
          .select('id,owner_user_id,name,business_name,trading_name,verification_status')
          .eq('owner_user_id', profile.id)
          .maybeSingle();

        if (!active) return;
        setMe(profile);
        setSubject(profile);
        setTeamAccount((teamRow as TeamAccount | null) || null);
      })().catch(() => {});

      return () => {
        active = false;
      };
    }, [publicView, viewingUserId]),
  );

  const avgStars = useMemo(() => {
    if (!reviews.length) return 0;
    const sum = reviews.reduce((acc, r) => acc + Number(r.stars || 0), 0);
    return Math.round((sum / reviews.length) * 2) / 2;
  }, [reviews]);

  function StarRow({ value }: { value: number }) {
    const icons = [];
    let left = value;
    for (let i = 0; i < 5; i++) {
      if (left >= 1) { icons.push(<List.Icon key={i} icon="star" color={theme.colors.primary} />); left -= 1; }
      else if (left >= 0.5) { icons.push(<List.Icon key={i} icon="star-half-full" color={theme.colors.primary} />); left = 0; }
      else { icons.push(<List.Icon key={i} icon="star-outline" color={theme.colors.primary} />); }
    }
    return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{icons}</View>;
  }

  async function saveTraderProfile() {
    if (!subject || !isOwnProfile) return;
    const basePatch = { location: location.trim(), bio: bio.trim(), tags };
    const trustPatch = subject.trader_mode === 'team' || !!teamAccount
      ? { business_accreditations: businessAccreditations }
      : { qualifications };
    const { error } = await supabase
      .from('profiles')
      .update({
        ...basePatch,
        ...trustPatch,
        public_liability_insurance: publicLiabilityInsurance.trim() || null,
      })
      .eq('id', subject.id);
    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (
        !message.includes('public_liability_insurance') &&
        !message.includes('qualifications') &&
        !message.includes('business_accreditations') &&
        !message.includes('schema cache')
      ) {
        Alert.alert('Could not save profile', error.message);
        return;
      }
      const { error: fallbackError } = await supabase.from('profiles').update(basePatch).eq('id', subject.id);
      if (fallbackError) {
        Alert.alert('Could not save profile', fallbackError.message);
        return;
      }
    }
    setSubject((s) => (s ? {
      ...s,
      location: location.trim(),
      bio: bio.trim(),
      tags,
      qualifications,
      business_accreditations: businessAccreditations,
      public_liability_insurance: publicLiabilityInsurance.trim() || null,
    } : s));
    setEditMode(false);
    Alert.alert('Profile saved', 'Your profile changes are now live.');
  }

  function cancelTraderEdit() {
    if (!subject) return;
    setLocation(subject.location || '');
    setBio(subject.bio || '');
    setTags(subject.tags || []);
    setQualifications(subject.qualifications || []);
    setBusinessAccreditations(subject.business_accreditations || []);
    setPublicLiabilityInsurance(subject.public_liability_insurance || '');
    setSkillQuery('');
    setQualificationInput('');
    setEditMode(false);
  }
  async function changeAvatar() {
    if (!subject || !isOwnProfile) return;
    try {
      setUploadingAvatar(true);
      const uri = await pickProfileImage();
      if (!uri) return;
      const publicUrl = await uploadAvatar(subject.id, uri);
      const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', subject.id);
      if (error) throw error;
      setSubject(s => (s ? { ...s, avatar_url: publicUrl } : s));
      setMe(s => (s ? { ...s, avatar_url: publicUrl } : s));
    } catch (e: any) {
      Alert.alert('Photo upload', e.message || 'Could not upload photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }
  function toggleTag(tag: string) {
    if (tag === 'Other') return;
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  function addSkill(value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    const canonical = TAG_OPTIONS.find(option => option.toLowerCase() === normalized.toLowerCase()) || normalized;
    setTags(prev => prev.some(tag => tag.toLowerCase() === canonical.toLowerCase()) ? prev : [...prev, canonical]);
    setSkillQuery('');
  }

  function addCustomSkill() {
    const value = skillQuery.trim();
    if (!value) return;
    addSkill(value);
  }

  function addTrustDetail() {
    const value = qualificationInput.trim();
    if (!value) return;
    if (subject?.trader_mode === 'team' || !!teamAccount) {
      setBusinessAccreditations(prev => prev.includes(value) ? prev : [...prev, value]);
    } else {
      setQualifications(prev => prev.includes(value) ? prev : [...prev, value]);
    }
    setQualificationInput('');
  }

  // Loading / missing
  if (loading) {
    return <BrandScreenFrame><ScreenState loading title="Loading profile" /></BrandScreenFrame>;
  }
  if (subject === null) {
    return (
      <BrandScreenFrame onBack={publicView ? () => nav.goBack() : undefined}>
        <ScreenState
          title="Profile unavailable"
          message="It may be private or not set up yet."
          icon="account-off-outline"
          actionLabel={publicView ? 'Go back' : undefined}
          onAction={publicView ? () => nav.goBack() : undefined}
        />
      </BrandScreenFrame>
    );
  }

  // Header card (shared)
  const headerCard = (
    <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
      <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {subject.avatar_url ? (
          <Avatar.Image source={{ uri: subject.avatar_url }} size={48} />
        ) : (
          <Avatar.Icon icon="account" size={48} />
        )}
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={{ }}>
            {subject.name || 'Profile'}
          </Text>
          {isTrader && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <StarRow value={avgStars} />
              <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                {reviews.length ? `${avgStars.toFixed(1)} • ${reviews.length} review${reviews.length === 1 ? '' : 's'}` : 'No reviews yet'}
              </Text>
            </View>
          )}
        </View>

      </Card.Content>
    </Card>
  );

  // Trader profile block (editable for owner; read-only otherwise)
  const traderBlock = isTrader && (
    <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
      <Card.Title
        title="About"
        right={(props) =>
          isOwnProfile && !publicView ? (
            <Button mode="text" onPress={() => (editMode ? saveTraderProfile() : setEditMode(true))}>
              {editMode ? 'Save' : 'Edit'}
            </Button>
          ) : null
        }
      />
      <Card.Content style={{ gap: 12 }}>
        {isOwnProfile && !publicView && (
          <Button mode="contained-tonal" icon="camera-outline" onPress={changeAvatar} loading={uploadingAvatar} disabled={uploadingAvatar}>
            {subject.avatar_url ? 'Change profile image' : 'Upload profile image'}
          </Button>
        )}

        {/* Tags */}
        <View>
          <Text variant="labelLarge" style={{ marginBottom: 6 }}>Skills / Tags</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(editMode && isOwnProfile && !publicView ? TAG_OPTIONS : (subject.tags || [])).map((tag) => {
              const selected = (tags || []).includes(tag);
              return editMode && isOwnProfile && !publicView ? (
                <Chip key={tag} selected={selected} onPress={() => toggleTag(tag)} icon={selected ? 'check' : undefined} compact>
                  {tag}
                </Chip>
              ) : subject.tags?.includes(tag) ? (
                <Chip key={tag} compact>{tag}</Chip>
              ) : null;
            })}
            {!editMode && (!subject.tags || subject.tags.length === 0) && (
              <Text variant="bodySmall" style={{ opacity: 0.6 }}>No tags yet.</Text>
            )}
          </View>
        </View>

        {/* Location */}
        <View>
          <Text variant="labelLarge" style={{ marginBottom: 6 }}>Location</Text>
          {editMode && isOwnProfile && !publicView ? (
            <LocationInput placeholder="e.g. Birmingham, UK" value={location} onChangeText={setLocation} />
          ) : (
            <Text variant="bodyMedium" style={{ opacity: 0.8 }}>{subject.location || '—'}</Text>
          )}
        </View>

        {/* Bio */}
        <View>
          <Text variant="labelLarge" style={{ marginBottom: 6 }}>Bio</Text>
          {editMode && isOwnProfile && !publicView ? (
            <TextInput mode="outlined" placeholder="Tell clients about your experience…" value={bio} onChangeText={setBio} multiline />
          ) : (
            <Text variant="bodyMedium" style={{ opacity: 0.8 }}>{subject.bio || '—'}</Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  const isTeamProfile =
    subject.trader_mode === 'team' ||
    !!teamAccount ||
    (isOwnProfile && authTraderMode === 'team');
  const traderDisplayName = teamAccount?.business_name || teamAccount?.trading_name || teamAccount?.name || subject.name || 'Tradie';
  const trustDetails = editMode
    ? (isTeamProfile ? businessAccreditations : qualifications)
    : (isTeamProfile ? subject.business_accreditations || [] : subject.qualifications || []);
  const filteredSkillOptions = skillQuery.trim().length >= 2
    ? TAG_OPTIONS.filter(tag =>
        tag.toLowerCase().includes(skillQuery.trim().toLowerCase()) &&
        !tags.some(selected => selected.toLowerCase() === tag.toLowerCase()),
      ).slice(0, 5)
    : [];
  const canAddSkillQuery = skillQuery.trim().length >= 2 && !tags.some(
    selected => selected.toLowerCase() === skillQuery.trim().toLowerCase(),
  );

  const traderSlideBlock = isTrader && (
    <View
      style={{
        backgroundColor: 'transparent',
        marginBottom: 14,
      }}
    >
      <View style={{ paddingHorizontal: screenGutter, paddingVertical: 16, gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 9 }}>
          {subject.avatar_url ? (
            <Avatar.Image source={{ uri: subject.avatar_url }} size={72} />
          ) : (
            <Avatar.Icon icon={isTeamProfile ? 'office-building' : 'account'} size={72} style={{ backgroundColor: BRAND_COLORS.outline }} color={BRAND_COLORS.textMuted} />
          )}
          <View style={{ alignItems: 'center', gap: 5 }}>
            <Text
              variant="headlineMedium"
              numberOfLines={2}
              style={{ color: BRAND_COLORS.maroon, fontFamily: 'Satoshi-Bold', textAlign: 'center' }}
            >
              {traderDisplayName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <MCIcon name="star" size={22} color={BRAND_COLORS.maroon} />
              <Text variant="titleLarge" style={{ color: BRAND_COLORS.textMuted, fontFamily: 'Satoshi-Bold' }}>
                {reviews.length ? avgStars.toFixed(1) : 'New'}
              </Text>
            </View>
          </View>
        </View>

        {isOwnProfile && !publicView && (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button mode="contained-tonal" icon="camera-outline" onPress={changeAvatar} loading={uploadingAvatar} disabled={uploadingAvatar} style={{ flex: 1, minWidth: 132 }}>
                Change photo
              </Button>
              {editMode ? (
                <>
                  <Button mode="outlined" icon="close" onPress={cancelTraderEdit} style={{ flex: 1, minWidth: 112 }}>
                    Cancel
                  </Button>
                  <Button mode="contained" buttonColor={BRAND_COLORS.orange} icon="check" onPress={saveTraderProfile} style={{ flex: 1, minWidth: 140 }}>
                    Save changes
                  </Button>
                </>
              ) : (
                <Button mode="contained" buttonColor={BRAND_COLORS.orange} icon="pencil" onPress={() => setEditMode(true)} style={{ flex: 1, minWidth: 132 }}>
                  Edit profile
                </Button>
              )}
            </View>
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontFamily: 'Satoshi-Regular' }}>Skills</Text>
          {!!tags.length && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {tags.map(tag => (
                <Chip
                  key={tag}
                  compact
                  closeIcon={editMode && isOwnProfile && !publicView ? 'close' : undefined}
                  onClose={editMode && isOwnProfile && !publicView ? () => toggleTag(tag) : undefined}
                  style={{ backgroundColor: theme.dark ? theme.colors.surfaceVariant : BRAND_COLORS.orangeSoft }}
                  textStyle={{ color: theme.dark ? theme.colors.onSurface : BRAND_COLORS.maroon }}
                >
                  {tag}
                </Chip>
              ))}
            </View>
          )}
          {editMode && isOwnProfile && !publicView && (
            <View style={{ gap: 8 }}>
              <TextInput
                mode="outlined"
                label="Search or add a skill"
                placeholder="Start typing, e.g. plumber"
                value={skillQuery}
                onChangeText={setSkillQuery}
                onSubmitEditing={addCustomSkill}
                left={<TextInput.Icon icon="magnify" />}
              />
              {!!filteredSkillOptions.length && (
                <View style={{ borderWidth: 1, borderColor: theme.colors.outlineVariant, borderRadius: 16, overflow: 'hidden' }}>
                  {filteredSkillOptions.map((tag, index) => (
                    <Pressable
                      key={tag}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${tag}`}
                      onPress={() => addSkill(tag)}
                      style={({ pressed }) => ({
                        minHeight: 46,
                        paddingHorizontal: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 9,
                        backgroundColor: pressed ? theme.colors.surfaceVariant : theme.colors.surface,
                        borderTopWidth: index ? 1 : 0,
                        borderTopColor: theme.colors.outlineVariant,
                      })}
                    >
                      <MCIcon name="plus" size={18} color={BRAND_COLORS.orange} />
                      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>{tag}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {canAddSkillQuery && !TAG_OPTIONS.some(option => option.toLowerCase() === skillQuery.trim().toLowerCase()) && (
                <Button mode="outlined" icon="plus" onPress={addCustomSkill}>
                  Add “{skillQuery.trim()}”
                </Button>
              )}
            </View>
          )}
          {!editMode && !(subject.tags || []).length && (
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>Not added yet</Text>
          )}
        </View>

        <View style={{ gap: 6 }}>
          <Text variant="bodyLarge" style={{ color: BRAND_COLORS.textMuted, fontFamily: 'Satoshi-Regular' }}>Location</Text>
          {editMode && isOwnProfile && !publicView ? (
            <LocationInput placeholder="Town, city, county, or postcode" value={location} onChangeText={setLocation} />
          ) : (
            <Text variant="bodyLarge" style={{ color: BRAND_COLORS.textMuted }}>{subject.location || 'Not added yet'}</Text>
          )}
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontFamily: 'Satoshi-Regular' }}>
            {isTeamProfile ? 'Business accreditations' : 'Qualifications'}
          </Text>
          {trustDetails.length ? trustDetails.map(detail => (
            <View key={detail} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MCIcon name="check-decagram" size={20} color={BRAND_COLORS.maroon} />
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, fontFamily: 'Satoshi-Regular', flex: 1 }}>{detail}</Text>
              {editMode && isOwnProfile && !publicView && (
                <IconButton
                  icon="close"
                  size={18}
                  accessibilityLabel={`Remove ${detail}`}
                  onPress={() => isTeamProfile
                    ? setBusinessAccreditations(prev => prev.filter(item => item !== detail))
                    : setQualifications(prev => prev.filter(item => item !== detail))}
                />
              )}
            </View>
          )) : <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>Not added yet</Text>}
          {editMode && isOwnProfile && !publicView && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                mode="outlined"
                label={isTeamProfile ? 'Add accreditation' : 'Add qualification'}
                value={qualificationInput}
                onChangeText={setQualificationInput}
                onSubmitEditing={addTrustDetail}
                style={{ flex: 1 }}
              />
              <Button mode="contained" onPress={addTrustDetail} disabled={!qualificationInput.trim()}>Add</Button>
            </View>
          )}
        </View>

        <View style={{ gap: 7 }}>
          <Text variant="bodyLarge" style={{ color: BRAND_COLORS.textMuted, fontFamily: 'Satoshi-Regular' }}>Public liability insurance</Text>
          {editMode && isOwnProfile && !publicView ? (
            <TextInput mode="outlined" label="Insurance details" value={publicLiabilityInsurance} onChangeText={setPublicLiabilityInsurance} placeholder="Provider or cover summary" />
          ) : (
            <Text variant="bodyLarge" style={{ color: BRAND_COLORS.textMuted }}>{subject.public_liability_insurance || 'Not added yet'}</Text>
          )}
        </View>

        {(editMode || !!subject.bio) && (
          <View style={{ borderWidth: 1, borderColor: theme.colors.outlineVariant, borderRadius: 18, padding: 14, minHeight: 110, gap: 6, backgroundColor: theme.colors.surface }}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>About</Text>
            {editMode && isOwnProfile && !publicView ? (
              <TextInput mode="outlined" label="About your work" value={bio} onChangeText={setBio} multiline numberOfLines={4} placeholder="Tell customers about your experience and the work you take on." />
            ) : (
              <Text variant="bodyLarge" style={{ color: BRAND_COLORS.textMuted, lineHeight: 25 }}>{subject.bio}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );

  const profitRingRadius = 54;
  const profitRingCircumference = 2 * Math.PI * profitRingRadius;
  const demoPaidCents = 302400;
  const demoProtectedCents = 80000;
  const demoAwaitingCents = 50000;
  const demoSecuredCents = demoPaidCents + demoProtectedCents;
  const demoPaidRatio = demoPaidCents / demoSecuredCents;
  const demoProtectedRatio = demoProtectedCents / demoSecuredCents;

  const financialTrackerBlock = isTrader && isOwnProfile && !publicView && (
    <View style={{ paddingHorizontal: screenGutter, marginBottom: 18 }}>
      <View
        style={{
          borderRadius: 16,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
          padding: 16,
          gap: 14,
          shadowColor: '#581a1f',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: theme.dark ? 0.22 : 0.08,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>Financial tracker</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3 }}>
              Paid, protected and awaiting at a glance
            </Text>
          </View>
          <View style={{ borderRadius: 10, backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Demo preview
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={150} height={150} viewBox="0 0 150 150">
              <Circle
                cx={75}
                cy={75}
                r={profitRingRadius}
                fill="none"
                stroke={theme.colors.outlineVariant}
                strokeWidth={18}
              />
              <Circle
                cx={75}
                cy={75}
                r={profitRingRadius}
                fill="none"
                stroke={BRAND_COLORS.maroonStrong}
                strokeWidth={18}
                strokeDasharray={`${profitRingCircumference * demoPaidRatio} ${profitRingCircumference}`}
                transform="rotate(-90 75 75)"
              />
              <Circle
                cx={75}
                cy={75}
                r={profitRingRadius}
                fill="none"
                stroke={BRAND_COLORS.maroon}
                strokeWidth={18}
                strokeDasharray={`${profitRingCircumference * demoProtectedRatio} ${profitRingCircumference}`}
                strokeDashoffset={-profitRingCircumference * demoPaidRatio}
                transform="rotate(-90 75 75)"
              />
            </Svg>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 82,
                minHeight: 64,
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 41,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                backgroundColor: theme.dark ? theme.colors.surfaceVariant : BRAND_COLORS.white,
              }}
            >
              <Text
                variant="titleMedium"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ width: '100%', color: theme.colors.onSurface, textAlign: 'center' }}
              >
                {formatGBPCents(demoSecuredCents)}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Secured</Text>
            </View>
          </View>

          <View style={{ width: '100%', gap: 10 }}>
            {[
              { label: 'Paid to you', value: demoPaidCents, color: BRAND_COLORS.maroonStrong },
              { label: 'Protected', value: demoProtectedCents, color: BRAND_COLORS.maroon },
              { label: 'Awaiting payment', value: demoAwaitingCents, color: theme.colors.outline },
            ].map(item => (
              <View key={item.label} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: item.color }} />
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{item.label}</Text>
                </View>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>{formatGBPCents(item.value)}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          Demo values only. No live earnings are shown yet.
        </Text>
        <Button mode="contained-tonal" icon="chart-donut" onPress={() => nav.navigate('FinancialTracker')}>
          Open financial tracker
        </Button>
      </View>
    </View>
  );

  // Client (own profile): nicer block with email + bank details button
  const showClientSlideProfile = isClient && isOwnProfile && !publicView;

  const clientOwnBlock = showClientSlideProfile && (
    <View
      style={{
        backgroundColor: 'transparent',
        marginBottom: 12,
      }}
    >
      <View style={{ paddingHorizontal: screenGutter, paddingTop: 8, paddingBottom: 20, gap: 22 }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          {subject.avatar_url ? (
            <Avatar.Image source={{ uri: subject.avatar_url }} size={84} />
          ) : (
            <Avatar.Icon icon="account" size={84} style={{ backgroundColor: BRAND_COLORS.outline }} color={BRAND_COLORS.textMuted} />
          )}

          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text variant="headlineMedium" style={{ color: BRAND_COLORS.maroon, fontFamily: 'Satoshi-Bold', textAlign: 'center' }}>
              {subject.name || 'Profile'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MCIcon name="star" size={20} color={BRAND_COLORS.maroon} />
              <Text variant="titleMedium" style={{ color: BRAND_COLORS.textMuted, }}>
                Trusted account
              </Text>
            </View>
          </View>
        </View>

        <Button mode="contained-tonal" icon="camera-outline" onPress={changeAvatar} loading={uploadingAvatar} disabled={uploadingAvatar}>
          Change profile photo
        </Button>

      </View>
    </View>
  );

  const traderMenuLink = (label: string, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 7,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="titleLarge" style={{ color: BRAND_COLORS.textMuted, }}>{label}</Text>
      <MCIcon name="chevron-right" size={25} color={BRAND_COLORS.textMuted} />
    </Pressable>
  );

  const traderMenuBlock = isTrader && isOwnProfile && !publicView && (
    <View style={{ borderTopWidth: 1, borderTopColor: BRAND_COLORS.outline, paddingHorizontal: screenGutter, paddingTop: 24, gap: 22, marginBottom: 14 }}>
      <View style={{ gap: 5 }}>
        <Text variant="titleLarge" style={{ color: BRAND_COLORS.maroon, }}>Manage account</Text>
        {traderMenuLink('App settings', () => setSettingsOpen(true))}
        {traderMenuLink('Update account holder', () => setEditMode(true))}
        {isTeamProfile
          ? traderMenuLink('Add team members', () => nav.navigate('TeamMembers'))
          : traderMenuLink('Switch to a team account', () => nav.navigate('TeamMembers', { conversion: true }))}
      </View>

      <View style={{ gap: 5 }}>
        <Text variant="titleLarge" style={{ color: BRAND_COLORS.maroon, }}>Payments</Text>
        {traderMenuLink('Stripe payout setup', () => nav.navigate('BankDetails'))}
      </View>

      <View style={{ gap: 5 }}>
        <Text variant="titleLarge" style={{ color: BRAND_COLORS.maroon, }}>About</Text>
        {traderMenuLink('Terms & conditions', () => nav.navigate('StaticInfo', { kind: 'terms' }))}
        {traderMenuLink('Privacy', () => nav.navigate('StaticInfo', { kind: 'privacy' }))}
        {traderMenuLink('Manage cookies', () => nav.navigate('StaticInfo', { kind: 'cookies' }))}
      </View>

      <View style={{ gap: 5 }}>
        <Text variant="titleLarge" style={{ color: BRAND_COLORS.maroon, }}>Support</Text>
        {traderMenuLink('Contact us', () => nav.navigate('ContactUs', { category: 'get_help' }))}
        {traderMenuLink('Report a bug', () => nav.navigate('ContactUs', { category: 'report_bug', subject: 'App bug' }))}
        {traderMenuLink('Share feedback', () => nav.navigate('ReviewExperience', { mode: 'yakka' }))}
      </View>

      <Button
        mode="contained"
        buttonColor={BRAND_COLORS.orange}
        icon="account-heart-outline"
        onPress={async () => {
          await Share.share({ message: 'Join me on Yakka: https://yakka.app' });
        }}
        style={{ borderRadius: 18 }}
      >
        Refer friend
      </Button>
      <Text variant="titleMedium" style={{ color: BRAND_COLORS.maroon, textAlign: 'center' }}>
        No Yakka fees on your next 3 completed jobs after the referral is verified
      </Text>

      <Button
        mode="text"
        icon="logout"
        textColor={BRAND_COLORS.maroon}
        onPress={() => supabase.auth.signOut()}
        style={{ alignSelf: 'flex-start' }}
      >
        Log out
      </Button>
    </View>
  );

  const supportBlock = isOwnProfile && !publicView && (
    <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
      <Card.Title title="Support" />
      <Card.Content style={{ gap: 10 }}>
        <Button mode="contained-tonal" icon="headset" onPress={() => nav.navigate('ContactUs')}>
          Contact us
        </Button>
        <Button mode="contained-tonal" icon="star-outline" onPress={() => nav.navigate('ReviewExperience', { mode: 'yakka' })}>
          Share feedback
        </Button>
        <Button mode="contained-tonal" icon="file-document-outline" onPress={() => nav.navigate('StaticInfo', { kind: 'terms' })}>
          Terms & conditions
        </Button>
        <Button mode="contained-tonal" icon="shield-lock-outline" onPress={() => nav.navigate('StaticInfo', { kind: 'privacy' })}>
          Privacy
        </Button>
        <Button mode="contained-tonal" icon="cookie-outline" onPress={() => nav.navigate('StaticInfo', { kind: 'cookies' })}>
          Manage cookies
        </Button>
        <Button
          mode="contained-tonal"
          icon="account-heart-outline"
          onPress={async () => {
            await Share.share({
              message: 'Join me on Yakka: https://yakka.app',
            });
          }}
        >
          Refer friend & No Yakka fees on your next 3 completed jobs
        </Button>
      </Card.Content>
    </Card>
  );

  const adminBlock = isAdmin && isOwnProfile && !publicView && (
    <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
      <Card.Title title="Yakka admin" />
      <Card.Content style={{ gap: 10 }}>
        <Button mode="contained" icon="shield-search" onPress={() => nav.navigate('AdminDashboard')}>
          Search jobs and disputes
        </Button>
      </Card.Content>
    </Card>
  );

  // Trader: Past jobs (from visible reviews that belong to completed jobs)
  const pastJobsList = isTrader && (
    <>
      <Text variant="titleSmall" style={{ marginBottom: 6 }}>Past jobs</Text>
      <Divider />
      {reviews.length ? (
        reviews.map((item) => (
          <Card key={item.id} mode="contained" style={{ marginVertical: 8, borderRadius: 24 }}>
            <Card.Title
              title={item.job?.title || 'Job'}
              subtitle={isoToDMY(item.job?.end_date) || isoToDMY(item.created_at)}
              right={() => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <List.Icon icon="star" />
                  <Text>{Number(item.stars).toFixed(1)}</Text>
                </View>
              )}
            />
            {!!item.comment && (
              <Card.Content>
                <Text variant="bodyMedium" style={{ opacity: 0.8 }}>{item.comment}</Text>
              </Card.Content>
            )}
          </Card>
        ))
      ) : (
        <View style={{ paddingTop: 24 }}>
          <Text variant="bodyLarge" style={{ textAlign: 'center', opacity: 0.7 }}>
            No completed jobs or visible reviews yet.
          </Text>
        </View>
      )}
    </>
  );

  return (
    <BrandScreenFrame
      onBack={publicView ? () => nav.goBack() : undefined}
      right={showSettingsCog ? (
        <IconButton
          icon="cog-outline"
          iconColor={settingsOpen ? BRAND_COLORS.orange : BRAND_COLORS.white}
          accessibilityLabel={settingsOpen ? 'Close app settings' : 'Open app settings'}
          onPress={() => setSettingsOpen(open => !open)}
          style={{ margin: 0 }}
        />
      ) : undefined}
      revealContent={showSettingsCog ? <SettingsScreen embedded /> : undefined}
      revealed={showSettingsCog && settingsOpen}
      onRevealedChange={setSettingsOpen}
      revealAccessibilityLabel="App settings curtain"
    >
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!settingsOpen}
        contentContainerStyle={{ width: '100%', maxWidth: BRAND_CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: 18, paddingBottom: 32 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: screenGutter, marginBottom: 8 }}>
          <Text
            variant="headlineMedium"
            style={{ color: BRAND_COLORS.maroon, fontFamily: 'Satoshi-Bold', flex: 1 }}
          >
            Profile
          </Text>
        </View>
      {showClientSlideProfile ? (
        <>
          {clientOwnBlock}
        </>
      ) : isTrader ? (
        <>
          {traderSlideBlock}
          {financialTrackerBlock}
        </>
      ) : (
        <>
          {headerCard}
          {adminBlock}
          {clientOwnBlock}
          {supportBlock}
        </>
      )}

      {/* Client-only: Sign out at the very bottom of the account page */}
      {!isTrader && isOwnProfile && !publicView && (
        <Button
          mode="text"
          icon="logout"
          onPress={() => supabase.auth.signOut()}
          style={{ marginTop: 8, marginHorizontal: 20, alignSelf: 'flex-start' }}
        >
          Sign out
        </Button>
      )}

      </ScrollView>
    </BrandScreenFrame>
  );
}

