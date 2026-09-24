import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Button, Card, Text, TextInput, useTheme } from '../ui/paper';
import { BRAND_COLORS } from '../theme';

type Prediction = {
  place_id: string;
  description: string;
};

type Props = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

let mapsScriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript() {
  if (Platform.OS !== 'web') return Promise.resolve();
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (!GOOGLE_PLACES_KEY) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-yakka-google-places="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Google Places.')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_PLACES_KEY)}&libraries=places&language=en-GB&region=GB`;
    script.async = true;
    script.defer = true;
    script.dataset.yakkaGooglePlaces = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Places.'));
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

async function fetchNativePredictions(input: string): Promise<Prediction[]> {
  const params = new URLSearchParams({
    input,
    key: GOOGLE_PLACES_KEY,
    language: 'en-GB',
    region: 'uk',
    components: 'country:gb',
    types: 'geocode',
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
  const json = await res.json();
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(json.error_message || json.status || 'Could not load locations.');
  }
  return (json.predictions || []).map((prediction: any) => ({
    place_id: prediction.place_id,
    description: prediction.description,
  }));
}

async function fetchWebPredictions(input: string): Promise<Prediction[]> {
  await loadGoogleMapsScript();
  if (!window.google?.maps?.places?.AutocompleteService) return [];

  const service = new window.google.maps.places.AutocompleteService();
  return new Promise(resolve => {
    service.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: 'gb' },
        language: 'en-GB',
        region: 'gb',
        types: ['geocode'],
      },
      (results: any[] | null) => {
        resolve(
          (results || []).map(prediction => ({
            place_id: prediction.place_id,
            description: prediction.description,
          })),
        );
      },
    );
  });
}

export default function LocationInput({
  label = 'Location',
  value,
  onChangeText,
  placeholder = 'Start typing a UK address or postcode',
}: Props) {
  const theme = useTheme();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const canSearch = useMemo(() => GOOGLE_PLACES_KEY && value.trim().length >= 3 && hasFocus, [value, hasFocus]);

  useEffect(() => {
    if (!canSearch) {
      setPredictions([]);
      setError('');
      return;
    }

    const id = ++requestId.current;
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const next = Platform.OS === 'web'
          ? await fetchWebPredictions(value.trim())
          : await fetchNativePredictions(value.trim());
        if (requestId.current === id) setPredictions(next.slice(0, 5));
      } catch (e: any) {
        if (requestId.current === id) {
          setPredictions([]);
          setError(e?.message || 'Could not load locations.');
        }
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [canSearch, value]);

  return (
    <View style={{ gap: 6 }}>
      <TextInput
        mode="outlined"
        label={label}
        value={value}
        onChangeText={text => {
          onChangeText(text);
          setHasFocus(true);
        }}
        onFocus={() => setHasFocus(true)}
        placeholder={placeholder}
        right={loading ? <TextInput.Icon icon="loading" /> : undefined}
      />

      {!GOOGLE_PLACES_KEY && (
        <Text variant="bodySmall" style={{ opacity: 0.65 }}>
          Add EXPO_PUBLIC_GOOGLE_PLACES_API_KEY to enable UK address suggestions.
        </Text>
      )}

      {!!error && (
        <Text variant="bodySmall" style={{ color: theme.colors.error }}>
          {error}
        </Text>
      )}

      {!!predictions.length && (
        <Card
          mode="contained"
          style={{
            borderRadius: 14,
            backgroundColor: theme.colors.elevation.level3,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
          }}
        >
          <Card.Content style={{ paddingVertical: 6, gap: 4 }}>
            {predictions.map(prediction => (
              <Button
                key={prediction.place_id}
                mode="text"
                compact
                onPress={() => {
                  onChangeText(prediction.description);
                  setPredictions([]);
                  setHasFocus(false);
                }}
                contentStyle={{ justifyContent: 'flex-start' }}
                labelStyle={{ textAlign: 'left' }}
              >
                {prediction.description}
              </Button>
            ))}
          </Card.Content>
        </Card>
      )}
    </View>
  );
}
