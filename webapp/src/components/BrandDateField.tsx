import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { DatePickerModal, enGB, registerTranslation } from 'react-native-paper-dates';
import { TextInput, Text, useTheme } from '../ui/paper';

registerTranslation('en-GB', enGB);

type Props = {
  label: string;
  value?: Date;
  onChange: (date?: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
};

function displayDate(date?: Date) {
  return date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}` : '';
}

export default function BrandDateField({ label, value, onChange, minimumDate, maximumDate }: Props) {
  const theme = useTheme();
  const [text, setText] = useState(displayDate(value));
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const formatted = displayDate(value);
  const lastEmitted = useRef(formatted);
  useEffect(() => {
    if (formatted !== lastEmitted.current) { setText(formatted); setInvalid(false); }
  }, [formatted]);
  const change = (next: string, showError = false) => {
    setText(next);
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(next);
    const date = match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : undefined;
    const valid = date && displayDate(date) === next
      && (!minimumDate || date >= new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate()))
      && (!maximumDate || date <= new Date(maximumDate.getFullYear(), maximumDate.getMonth(), maximumDate.getDate()));
    setInvalid(!!next && !valid && (showError || next.length === 10));
    lastEmitted.current = valid ? displayDate(date) : '';
    onChange(valid ? date : undefined);
  };
  return <View style={{ gap: 8 }}>
    <TextInput mode="outlined" label={label} accessibilityLabel={label}
      placeholder="DD/MM/YYYY" value={text} onChangeText={change} onBlur={() => change(text, true)}
      error={invalid} autoCorrect={false} maxLength={10}
      right={<TextInput.Icon icon="calendar-outline" accessibilityLabel={`Choose ${label.toLowerCase()}`} onPress={() => setOpen(true)} />} />
    {invalid && <Text variant="bodySmall" style={{ color: theme.colors.error }}>
      Enter a valid date as DD/MM/YYYY{minimumDate ? `, on or after ${displayDate(minimumDate)}` : ''}{maximumDate ? `, on or before ${displayDate(maximumDate)}` : ''}.
    </Text>}
    <DatePickerModal locale="en-GB" mode="single" visible={open} date={value}
      validRange={{ startDate: minimumDate, endDate: maximumDate }}
      onDismiss={() => setOpen(false)} onConfirm={({ date }) => {
        setOpen(false); setInvalid(false); setText(displayDate(date)); onChange(date);
      }} />
  </View>;
}
