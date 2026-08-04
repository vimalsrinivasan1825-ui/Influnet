/**
 * City field with suggestions, mobile.
 *
 * Stays free text — INDIAN_CITIES is a curated list of the biggest cities,
 * not every town, so a chip rail of matches beneath the field (rather than an
 * absolutely-positioned dropdown, which fights ScrollView clipping/zIndex on
 * RN) is the suggestion, not a restriction. Typing something not listed is a
 * normal, allowed outcome.
 */
import { useMemo } from 'react';
import { INDIAN_CITIES } from '@influnet/core';
import { Field, type FieldProps } from '@/components/ui/input';
import { ChipWrap, Chip } from '@/components/ui/chip';

export function CityField({
  value,
  onChangeText,
  ...rest
}: Omit<FieldProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (next: string) => void;
}) {
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return INDIAN_CITIES.filter((c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 6);
  }, [value]);

  return (
    <>
      <Field value={value} onChangeText={onChangeText} autoCapitalize="words" autoCorrect={false} {...rest} />
      {suggestions.length > 0 ? (
        <ChipWrap>
          {suggestions.map((city) => (
            <Chip key={city} label={city} onPress={() => onChangeText(city)} />
          ))}
        </ChipWrap>
      ) : null}
    </>
  );
}
