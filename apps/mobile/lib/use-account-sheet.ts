/**
 * Global open/close state for the account switcher sheet.
 *
 * The switcher lives once, mounted in the tab layout, so it can be summoned
 * from anywhere: the "Switch account" row in Profile, and a long-press on the
 * Profile tab in the bottom bar.
 */
import { create } from 'zustand';

interface AccountSheetState {
  visible: boolean;
  open: () => void;
  close: () => void;
}

export const useAccountSheet = create<AccountSheetState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
