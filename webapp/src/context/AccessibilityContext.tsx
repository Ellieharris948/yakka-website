import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  DEFAULT_FONT_SCALE,
  clampFontScale,
  normalizeFontScale,
} from '../utils/accessibility';

export {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  clampFontScale,
  normalizeFontScale,
} from '../utils/accessibility';

const FONT_SCALE_STORAGE_KEY = 'yakka.fontScale';
const COLOR_MODE_STORAGE_KEY = 'yakka.colorMode';

type AccessibilityContextValue = {
  fontScale: number;
  setFontScale: (scale: number) => void;
  colorMode: 'light' | 'dark';
  setColorMode: (mode: 'light' | 'dark') => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [fontScale, setFontScaleState] = useState(DEFAULT_FONT_SCALE);
  const systemColorMode = useColorScheme();
  const [preferredColorMode, setColorModeState] = useState<'light' | 'dark' | null>(null);
  const colorMode = preferredColorMode ?? (systemColorMode === 'dark' ? 'dark' : 'light');
  const fontPreferenceChanged = useRef(false);
  const colorPreferenceChanged = useRef(false);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY)
      .then(value => {
        if (!active || fontPreferenceChanged.current) return;
        const scale = normalizeFontScale(value);
        setFontScaleState(scale);
        if (value !== String(scale)) {
          void AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, String(scale)).catch(() => {});
        }
      })
      .catch(() => {});

    void AsyncStorage.getItem(COLOR_MODE_STORAGE_KEY)
      .then(value => {
        if (active && !colorPreferenceChanged.current && (value === 'light' || value === 'dark')) {
          setColorModeState(value);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const setFontScale = useCallback((scale: number) => {
    fontPreferenceChanged.current = true;
    const nextScale = clampFontScale(scale);
    setFontScaleState(nextScale);
    void AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, String(nextScale)).catch(() => {});
  }, []);

  const setColorMode = useCallback((mode: 'light' | 'dark') => {
    colorPreferenceChanged.current = true;
    setColorModeState(mode);
    void AsyncStorage.setItem(COLOR_MODE_STORAGE_KEY, mode).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ fontScale, setFontScale, colorMode, setColorMode }),
    [colorMode, fontScale, setColorMode, setFontScale],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibilitySettings() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibilitySettings must be used inside AccessibilityProvider');
  }
  return context;
}
