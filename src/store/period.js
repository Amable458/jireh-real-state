import { create } from 'zustand';

const now = new Date();
export const usePeriod = create((set) => ({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  setYear: (year) => set({ year }),
  setMonth: (month) => set({ month }),
  setPeriod: (year, month) => set({ year, month })
}));
