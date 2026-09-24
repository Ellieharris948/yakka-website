import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import MCIcon from '../components/BrandIcon';
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Button,
  Checkbox,
  Divider,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "../ui/paper";

import { ensureMyProfile } from "../api/profile";
import BrandWordmark from "../components/BrandWordmark";
import { supabase } from "../lib/supabase";
import { setRememberSession } from "../lib/authStorage";
import { BRAND_COLORS, BRAND_RADII, getBrandHeaderGradient } from "../theme";
import BottomCurtain from "../components/BottomCurtain";
import { getResponsiveScreenGutter } from "../utils/layout";
import { passwordResetRedirect } from "../utils/passwords";

export default function Auth() {
  const theme = useTheme();
  const headerGradient = getBrandHeaderGradient(theme.dark);
  const nav = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 900;
  const screenGutter = getResponsiveScreenGutter(width);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const emailError = !!email && !/^\S+@\S+\.\S+$/.test(normalizedEmail);

  async function signIn() {
    if (!normalizedEmail || !password || emailError) return;

    try {
      setBusy(true);
      setRememberSession(rememberMe);
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;

      await ensureMyProfile();
    } catch (e: any) {
      Alert.alert("Sign-in failed", e.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendResetEmail() {
    if (sendingReset) return;
    const targetEmail = resetEmail.trim().toLowerCase() || normalizedEmail;
    if (!targetEmail || !/^\S+@\S+\.\S+$/.test(targetEmail)) {
      Alert.alert("Reset password", "Enter a valid email address first.");
      return;
    }

    try {
      setSendingReset(true);
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: passwordResetRedirect(
          Platform.OS === 'web' ? window.location.origin : undefined,
          Platform.OS === 'web' ? '/app/?reset-password=1' : undefined,
        ),
      });
      if (error) throw error;

      setForgotOpen(false);
      setResetEmail("");
      Alert.alert(
        "Check your email",
        "If an account exists for this email, you will receive a secure reset link. Check your spam folder too. On mobile, open the email on the device with Yakka installed.",
      );
    } catch (e: any) {
      Alert.alert(
        "Reset password",
        e?.message || "Could not send the reset email.",
      );
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={{ flex: 1, backgroundColor: headerGradient[0] }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          width: "100%",
          maxWidth: isDesktop ? 1080 : 500,
          alignSelf: "center",
          paddingHorizontal: isDesktop ? 40 : screenGutter,
          paddingVertical: isDesktop ? 44 : 28,
          gap: 18,
        }}
      >
        {isDesktop && (
          <View style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
            <BrandWordmark size={48} center light />
            <Text variant="headlineMedium" style={{ color: BRAND_COLORS.white, fontFamily: "Satoshi-Bold", textAlign: "center" }}>
              Your Yakka account, now on the web.
            </Text>
            <Text variant="bodyLarge" style={{ color: "rgba(255,255,255,0.82)", textAlign: "center", maxWidth: 620, lineHeight: 26 }}>
              Manage jobs, messages, payments and your profile with the same secure account you use in the app.
            </Text>
          </View>
        )}
        <LinearGradient
          colors={[...headerGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 34,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            shadowColor: "#581a1f",
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.28,
            shadowRadius: 28,
            elevation: 12,
          }}
        >
          <View
            style={{
              paddingHorizontal: 22,
              paddingTop: 24,
              paddingBottom: 16,
              alignItems: "center",
              gap: 18,
            }}
          >
            {!isDesktop && <BrandWordmark size={42} center light />}
            <Text
              variant="headlineSmall"
              style={{ color: BRAND_COLORS.white, fontFamily: "Satoshi-Bold" }}
            >
              Welcome back
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: screenGutter,
              paddingTop: 22,
              paddingBottom: 18,
              gap: 14,
            }}
          >
            <Text
              variant="bodyLarge"
              style={{
                color: BRAND_COLORS.white,
                textAlign: "center",
                lineHeight: 24,
              }}
            >
              Log in to continue your verified Yakka account.
            </Text>

            <TextInput
              label="Email address"
              placeholder="you@example.com"
              accessibilityLabel="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              error={emailError}
              mode="outlined"
              textColor={BRAND_COLORS.maroon}
              placeholderTextColor={BRAND_COLORS.textMuted}
              theme={{ colors: { onSurfaceVariant: BRAND_COLORS.maroon } }}
              left={<TextInput.Icon icon="email-outline" color={BRAND_COLORS.textMuted} />}
              outlineStyle={{
                borderRadius: BRAND_RADII.control,
                borderColor: BRAND_COLORS.outline,
              }}
              activeOutlineColor={BRAND_COLORS.orange}
              style={{ backgroundColor: BRAND_COLORS.cream, borderRadius: BRAND_RADII.control, overflow: "hidden" }}
              contentStyle={{ minHeight: 56, fontFamily: 'Satoshi-Regular', paddingHorizontal: 12 }}
            />
            {emailError && (
              <HelperText type="error">Please enter a valid email.</HelperText>
            )}

            <TextInput
              label="Password"
              placeholder="Enter your password"
              accessibilityLabel="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              mode="outlined"
              textColor={BRAND_COLORS.maroon}
              placeholderTextColor={BRAND_COLORS.textMuted}
              theme={{ colors: { onSurfaceVariant: BRAND_COLORS.maroon } }}
              left={<TextInput.Icon icon="lock-outline" color={BRAND_COLORS.textMuted} />}
              right={(
                <TextInput.Icon
                  icon={passwordVisible ? "eye-off-outline" : "eye-outline"}
                  accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
                  onPress={() => setPasswordVisible(value => !value)}
                />
              )}
              outlineStyle={{
                borderRadius: BRAND_RADII.control,
                borderColor: BRAND_COLORS.outline,
              }}
              activeOutlineColor={BRAND_COLORS.orange}
              style={{ backgroundColor: BRAND_COLORS.cream, borderRadius: BRAND_RADII.control, overflow: "hidden" }}
              contentStyle={{ minHeight: 56, fontFamily: 'Satoshi-Regular', paddingHorizontal: 12 }}
              onSubmitEditing={() => void signIn()}
              returnKeyType="done"
            />

            <Button
              mode="text"
              onPress={() => {
                setResetEmail(normalizedEmail);
                setForgotOpen(true);
              }}
              textColor={BRAND_COLORS.white}
              style={{ alignSelf: "flex-end" }}
              labelStyle={{ }}
            >
              Forgot password?
            </Button>

            {Platform.OS === "web" && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: -4,
                }}
              >
                <Checkbox
                  status={rememberMe ? "checked" : "unchecked"}
                  onPress={() => setRememberMe((value) => !value)}
                  color={BRAND_COLORS.orange}
                />
                <Text
                  variant="bodyMedium"
                  style={{ color: BRAND_COLORS.white }}
                >
                  Stay signed in on this device
                </Text>
              </View>
            )}

            <Button
              mode="contained"
              onPress={signIn}
              disabled={!normalizedEmail || !password || emailError || busy}
              loading={busy}
              buttonColor={BRAND_COLORS.orange}
              textColor={BRAND_COLORS.white}
              theme={{ colors: { surfaceDisabled: BRAND_COLORS.orangeSoft, onSurfaceDisabled: BRAND_COLORS.maroon } }}
              style={{ borderRadius: BRAND_RADII.control, marginTop: 4 }}
              contentStyle={{ paddingVertical: 10 }}
            >
              Log in
            </Button>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginVertical: 2,
              }}
            >
              <Divider style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.24)" }} />
              <Text
                variant="bodyMedium"
                style={{ color: "rgba(255,255,255,0.74)" }}
              >
                Or
              </Text>
              <Divider style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.24)" }} />
            </View>

            <Button
              mode="contained"
              onPress={() => nav.navigate("Onboarding")}
              buttonColor={BRAND_COLORS.orangeSoft}
              textColor={BRAND_COLORS.maroon}
              style={{ borderRadius: BRAND_RADII.control }}
              contentStyle={{ paddingVertical: 10 }}
            >
              Create an account
            </Button>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: "rgba(244,244,236,0.22)",
              paddingHorizontal: screenGutter,
              paddingVertical: 16,
              gap: 8,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <MCIcon
                name="lock-outline"
                size={18}
                color={BRAND_COLORS.orangeSoft}
              />
              <Text
                variant="bodyMedium"
                style={{ color: BRAND_COLORS.white, flex: 1 }}
              >
                Identity checks and payout details stay inside your secure
                account setup.
              </Text>
            </View>
          </View>
        </LinearGradient>

        {busy && (
          <View style={{ alignItems: "center" }}>
            <ActivityIndicator color={BRAND_COLORS.maroon} />
          </View>
        )}
      </ScrollView>

      <BottomCurtain
        visible={forgotOpen}
        onDismiss={() => !sendingReset && setForgotOpen(false)}
        title="Reset password"
      >
          <View style={{ gap: 12 }}>
            <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
              Enter your email and we&apos;ll send you a secure link to reset
              your password.
            </Text>
            <TextInput
              mode="outlined"
              label="Email"
              accessibilityLabel="Reset email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={resetEmail}
              onChangeText={setResetEmail}
              left={<TextInput.Icon icon="email-outline" />}
              outlineStyle={{ borderRadius: BRAND_RADII.control }}
              style={{ borderRadius: BRAND_RADII.control, overflow: "hidden" }}
            />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              onPress={() => setForgotOpen(false)}
              disabled={sendingReset}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={sendResetEmail}
              loading={sendingReset}
              disabled={sendingReset}
            >
              Send email
            </Button>
          </View>
          </View>
      </BottomCurtain>
    </KeyboardAvoidingView>
  );
}
