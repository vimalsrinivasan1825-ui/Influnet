"use client";

/**
 * City field with suggestions. Stays free text on purpose — INDIAN_CITIES is a
 * curated list of the biggest cities, not every town, so typing something not
 * in the list is a normal, allowed outcome, not an error.
 */
import { useMemo, useRef, useState } from "react";
import { INDIAN_CITIES } from "@influnet/core";
import { Input } from "@/components/ui/input";

export function CityInput({
  value,
  onChange,
  placeholder = "Your city",
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return INDIAN_CITIES.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [value]);

  function pick(city: string) {
    onChange(city);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Let a click on a suggestion register before the list unmounts.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && suggestions[highlight]) {
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
            pick(suggestions[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-hairline-strong bg-surface-card shadow-lg">
          {suggestions.map((city, i) => (
            <li key={city}>
              <button
                type="button"
                className={`block w-full px-3.5 py-2 text-left text-sm ${
                  i === highlight ? "bg-surface-muted text-content" : "text-content-soft"
                }`}
                onMouseDown={(e) => {
                  // Fires before the input's onBlur commits, so the click still lands.
                  e.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  pick(city);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
