/**
 * A date field with a calendar, in plain JS.
 *
 * A native date picker would need a new native module (and so a new store
 * build); a typed "YYYY-MM-DD" box is what people were failing at. This is a
 * month grid that ships over the air. Value in and out is "YYYY-MM-DD".
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function DateField({
  label,
  value,
  onChange,
  minToday = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Disallow days before today (delivery dates). */
  minToday?: boolean;
}) {
  const t = useTheme();
  const today = new Date();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : today;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const shift = (by: number) => {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <View style={{ gap: 6 }}>
      <Txt variant="footnote" tone="muted" style={{ fontWeight: '600' }}>
        {label}
      </Txt>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          minHeight: 54,
          borderWidth: 1.5,
          borderColor: open ? t.color.content : t.color.hairline,
          borderRadius: 18,
          backgroundColor: t.color.surfaceCard,
          paddingHorizontal: t.spacing.lg,
        }}
      >
        <CalendarDays size={18} color={t.color.contentMuted} />
        <Txt variant="body" tone={value ? 'default' : 'muted'} style={{ flex: 1 }}>
          {value
            ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Pick a date'}
        </Txt>
      </Pressable>

      {open ? (
        <View style={{ borderWidth: 1, borderColor: t.color.hairline, borderRadius: t.radii.lg, padding: t.spacing.md, gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => shift(-1)} hitSlop={10}>
              <ChevronLeft size={20} color={t.color.content} />
            </Pressable>
            <Txt variant="bodyStrong">{`${MONTHS[month]} ${year}`}</Txt>
            <Pressable onPress={() => shift(1)} hitSlop={10}>
              <ChevronRight size={20} color={t.color.content} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {DOW.map((d, i) => (
              <Txt key={i} variant="caption" tone="muted" style={{ flex: 1, textAlign: 'center' }}>
                {d}
              </Txt>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((d, i) => {
              if (d === null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 40 }} />;
              const v = iso(year, month, d);
              const disabled = minToday && v < todayIso;
              const selected = v === value;
              return (
                <Pressable
                  key={v}
                  disabled={disabled}
                  onPress={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                  style={{ width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? t.color.brand : 'transparent',
                    }}
                  >
                    <Txt
                      variant="callout"
                      style={{
                        color: selected ? t.color.white : disabled ? t.color.hairlineStrong : t.color.content,
                        fontWeight: v === todayIso || selected ? '700' : '500',
                      }}
                    >
                      {d}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
