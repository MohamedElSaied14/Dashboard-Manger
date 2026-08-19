import { create } from "zustand";

/**
 * The header search box lives in the persistent shell while the results live in
 * a page, so the term is held in its own tiny store rather than lifted into a
 * context that would re-render the whole tree on every keystroke.
 */
interface SearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
