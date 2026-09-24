import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Button, Card, Chip, Divider, IconButton, Text, TextInput } from '../ui/paper';
import { supabase } from '../lib/supabase';
import BrandScreenHeader from '../components/BrandScreenHeader';
import ResponsivePageScrollView from '../components/ResponsivePageScrollView';
import ScreenState from '../components/ScreenState';

type TeamAccount = {
  id: string;
  owner_user_id: string;
  name: string;
  team_mode: 'solo' | 'team';
  business_name: string | null;
  company_registration_number: string | null;
  payout_provider: string | null;
  payout_status: string | null;
  verification_status: string | null;
  created_at: string;
};

type TeamMember = {
  id: string;
  team_account_id: string;
  user_id: string | null;
  email: string;
  role: 'account_owner' | 'team_member';
  status: 'invited' | 'active' | 'revoked';
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
};

type LegacyInvite = {
  id: string;
  owner_id: string;
  email: string;
  role: 'team_member' | 'account_owner';
  status: 'invited' | 'accepted' | 'revoked';
  created_at: string;
};

export default function TeamMembers({ route }: any) {
  const nav = useNavigation<any>();
  const conversionRequested = !!route?.params?.conversion;
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [teamAccount, setTeamAccount] = useState<TeamAccount | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [legacyInvites, setLegacyInvites] = useState<LegacyInvite[]>([]);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [structuredTeamsAvailable, setStructuredTeamsAvailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    setMe(profile);

    let loadedStructuredTeams = false;

    try {
      const { data: accountRow, error: accountError } = await supabase
        .from('team_accounts')
        .select('*')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (accountError) throw accountError;

      setTeamAccount((accountRow as TeamAccount | null) || null);
      loadedStructuredTeams = true;
      setStructuredTeamsAvailable(true);

      if (accountRow?.id) {
        const { data: memberRows, error: memberError } = await supabase
          .from('team_members')
          .select('*')
          .eq('team_account_id', accountRow.id)
          .order('created_at', { ascending: false });

        if (memberError) throw memberError;
        setTeamMembers((memberRows || []) as TeamMember[]);
      } else {
        setTeamMembers([]);
      }
    } catch {
      setStructuredTeamsAvailable(false);
      setTeamAccount(null);
      setTeamMembers([]);
    }

    try {
      const { data, error } = await supabase
        .from('team_invites')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLegacyInvites((data || []) as LegacyInvite[]);
    } catch {
      if (!loadedStructuredTeams) {
        Alert.alert(
          'Team setup',
          'The new structured team tables are not in your database yet. Run the new SQL file and this screen will become fully connected.',
        );
      }
      setLegacyInvites([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const emailValid = useMemo(() => /^\S+@\S+\.\S+$/.test(email.trim()), [email]);
  const activeMembers = useMemo(() => teamMembers.filter(member => member.status === 'active'), [teamMembers]);
  const invitedMembers = useMemo(
    () => teamMembers.filter(member => member.status === 'invited'),
    [teamMembers],
  );
  const isSoloTrader = !teamAccount && me?.trader_mode !== 'team';

  async function ensureTeamAccount(ownerUserId: string) {
    if (teamAccount?.id) return { id: teamAccount.id, created: false };

    const payload = {
      owner_user_id: ownerUserId,
      name: me?.name || 'Yakka Team',
      team_mode: 'team',
      business_name: me?.name || null,
      company_registration_number: null,
      payout_provider: 'stripe',
      payout_status: 'not_started',
      verification_status: 'pending',
    };

    const { data, error } = await supabase.from('team_accounts').insert(payload).select().single();
    if (error) throw error;

    const created = data as TeamAccount;
    setTeamAccount(created);

    await supabase.from('team_members').upsert(
      {
        team_account_id: created.id,
        user_id: ownerUserId,
        email: String(me?.email || '').toLowerCase(),
        role: 'account_owner',
        status: 'active',
        invited_by: ownerUserId,
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'team_account_id,email' },
    );

    return { id: created.id, created: true };
  }

  async function invite() {
    if (!emailValid) {
      Alert.alert('Check email', 'Please enter a valid email address.');
      return;
    }

    const normalizedInviteEmail = email.trim().toLowerCase();
    if (normalizedInviteEmail === String(me?.email || '').trim().toLowerCase()) {
      Alert.alert('Choose a teammate', 'Use another person\'s email address. Your account is already the account owner.');
      return;
    }

    let createdAccountId: string | null = null;
    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Not signed in');

      if (structuredTeamsAvailable) {
        const account = await ensureTeamAccount(user.id);
        if (account.created) createdAccountId = account.id;
        const { error } = await supabase.from('team_members').upsert(
          {
            team_account_id: account.id,
            email: normalizedInviteEmail,
            role: 'team_member',
            status: 'invited',
            invited_by: user.id,
          },
          { onConflict: 'team_account_id,email' },
        );
        if (error) throw error;

        if (isSoloTrader || me?.trader_mode !== 'team') {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ trader_mode: 'team' })
            .eq('id', user.id);
          if (profileError) throw profileError;
          const { error: metadataError } = await supabase.auth.updateUser({
            data: { trader_mode: 'team' },
          });
          if (metadataError) throw metadataError;
          setMe((current: any) => ({ ...current, trader_mode: 'team' }));
        }
      } else {
        if (isSoloTrader || conversionRequested) {
          throw new Error('The team-account server update must be deployed before a solo profile can be changed to a team profile. Your solo profile has not been changed.');
        }
        const { error } = await supabase.from('team_invites').insert({
          owner_id: user.id,
          email: normalizedInviteEmail,
          role: 'team_member',
          status: 'invited',
        });
        if (error) throw error;
      }

      setEmail('');
      await load();
      if (createdAccountId) {
        Alert.alert('Team account created', 'Your teammate has been invited and your public profile is now a team profile.');
      }
    } catch (e: any) {
      if (createdAccountId) {
        await supabase.from('team_accounts').delete().eq('id', createdAccountId);
        setTeamAccount(null);
      }
      Alert.alert('Could not invite', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function revoke(memberId: string) {
    try {
      if (structuredTeamsAvailable) {
        const { error } = await supabase.from('team_members').update({ status: 'revoked' }).eq('id', memberId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('team_invites').update({ status: 'revoked' }).eq('id', memberId);
        if (error) throw error;
      }
      await load();
    } catch (e: any) {
      Alert.alert('Could not update invite', e?.message || 'Please try again.');
    }
  }

  if (loading) {
    return <ScreenState loading title="Loading team" />;
  }

  return (
    <ResponsivePageScrollView keyboardShouldPersistTaps="handled">
      <BrandScreenHeader
        title={isSoloTrader ? 'Switch to a team account' : 'Team members'}
        onBack={() => nav.goBack()}
        chipLabel={isSoloTrader ? 'Solo tradie' : 'Team tradie'}
      />

      <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
        <Card.Content style={{ gap: 12 }}>
          <Text variant="headlineSmall" style={{ }}>
            {isSoloTrader ? 'Add your first teammate' : 'Invite your team'}
          </Text>
          <Text variant="bodyMedium" style={{ opacity: 0.75 }}>
            {isSoloTrader
              ? 'Your profile stays as a solo tradie until a valid teammate invitation is saved. Adding your first teammate changes the public profile to a team profile.'
              : 'Team members can handle day-to-day job updates while you keep full control of the main company account.'}
          </Text>
          <Divider />
          <TextInput
            mode="outlined"
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="katie@example.com"
          />
          <Button
            mode="contained"
            icon="email-plus-outline"
            onPress={invite}
            loading={saving}
            disabled={saving || !emailValid}
            style={{ borderRadius: 18 }}
          >
            {isSoloTrader ? 'Create team and send invite' : 'Send invite'}
          </Button>
        </Card.Content>
      </Card>

      <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
        <Card.Content style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Text variant="titleSmall" style={{ }}>Account owner</Text>
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Full access to account settings, business details, jobs, messages, payments, and team management.
            </Text>
          </View>
          <Divider />
          <View style={{ gap: 6 }}>
            <Text variant="titleSmall" style={{ }}>Team member</Text>
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Can view assigned jobs, message customers, upload updates, and mark work complete, but cannot change pricing, payments, or account settings.
            </Text>
          </View>
        </Card.Content>
      </Card>

      {structuredTeamsAvailable && !!teamAccount && (
        <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
          <Card.Content style={{ gap: 10 }}>
            <Text variant="titleSmall" style={{ }}>Company account</Text>
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              {teamAccount?.name || me?.name || 'Your team'} is the main account that your team members connect to.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip compact>{teamAccount?.team_mode === 'team' ? 'Team account' : 'Solo account'}</Chip>
              <Chip compact>{teamAccount?.payout_provider || 'stripe'}</Chip>
              <Chip compact>{teamAccount?.verification_status || 'pending'}</Chip>
            </View>
          </Card.Content>
        </Card>
      )}

      {structuredTeamsAvailable && !!teamAccount && (
        <Card mode="contained" style={{ borderRadius: 24, marginBottom: 12 }}>
          <Card.Title title="Connected team members" titleStyle={{ }} />
          <Card.Content style={{ gap: 10 }}>
            {activeMembers.map(member => (
              <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ }}>{member.email}</Text>
                  <Text variant="bodySmall" style={{ opacity: 0.65 }}>
                    {member.role === 'account_owner' ? 'Account owner' : 'Active team member'}
                  </Text>
                </View>
                <Chip compact>{member.status}</Chip>
              </View>
            ))}

            {!activeMembers.length && (
              <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
                No connected team members yet.
              </Text>
            )}
          </Card.Content>
        </Card>
      )}

      {!isSoloTrader && (
        <Card mode="contained" style={{ borderRadius: 24 }}>
          <Card.Title title={structuredTeamsAvailable ? 'Pending invites' : 'Invites'} titleStyle={{ }} />
          <Card.Content style={{ gap: 10 }}>
            {(structuredTeamsAvailable ? invitedMembers : legacyInvites).map((inviteRow: any) => (
              <View key={inviteRow.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ }}>{inviteRow.email}</Text>
                  <Text variant="bodySmall" style={{ opacity: 0.65 }}>
                    Team member
                  </Text>
                </View>
                <Chip compact>{inviteRow.status}</Chip>
                {inviteRow.status === 'invited' && (
                  <IconButton icon="close" onPress={() => revoke(inviteRow.id)} />
                )}
              </View>
            ))}

            {structuredTeamsAvailable && !invitedMembers.length && (
              <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
                No invites yet.
              </Text>
            )}

            {!structuredTeamsAvailable && !legacyInvites.length && (
              <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
                No invites yet.
              </Text>
            )}
          </Card.Content>
        </Card>
      )}
    </ResponsivePageScrollView>
  );
}
