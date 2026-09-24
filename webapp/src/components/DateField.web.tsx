import React from 'react';
import BrandDateField from './BrandDateField';

type DateFieldProps = {
  label: string;
  value?: Date;
  onChange: (date?: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
};

export default function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
}: DateFieldProps) {
  return <BrandDateField label={label} value={value} onChange={onChange}
    minimumDate={minimumDate} maximumDate={maximumDate} />;
}
