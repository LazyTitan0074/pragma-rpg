// The app's visual themes (Phase 7). Each theme defines a fixed set of color
// tokens consumed by components through ThemeContext — no component carries
// hardcoded colors anymore.
//
// Adding a new theme = add an object here + it automatically appears in the selector.

export const THEMES = {
  dark_gold: {
    label: "Dark Gold (classic)",
    vars: {
      bg: "#1c1b18",
      panel: "#221f1a",
      gameBg: "#181715",
      modalBg: "#1e1c18",
      bubblePlayer: "#26211a",
      bubbleDm: "#1f1d18",
      cardActive: "#24201a",
      detailsBg: "#241f16",
      dangerBg: "#241a1a",
      successBg: "#223326",
      btnSecondary: "#2a251e",
      btnTertiary: "#2a2824",
      border: "#3a3730",
      borderSoft: "#4a3e2b",
      borderFaint: "#2e2a22",
      gold: "#8a6d3b",
      goldBright: "#d4af37",
      green: "#5c7a6b",
      greenText: "#99d6a8",
      greenBrightText: "#b8ebd0",
      danger: "#6b2a2a",
      dangerText: "#e0b3a3",
      textDim: "#c9bd9e",
      textDimmer: "#a89a7a",
      textMuted: "#8a7d5e",
      textMid: "#d1c5a5",
      text: "#e8dfc8",
      textBright: "#f5edd6",
      textPlayer: "#f0ebe1",
      overlay: "rgba(10, 9, 8, 0.85)",
    },
  },

  pergament: {
    label: "Antique Parchment",
    vars: {
      bg: "#efe4c9",
      panel: "#f6eed7",
      gameBg: "#f3ead2",
      modalBg: "#faf3e0",
      bubblePlayer: "#ece0c2",
      bubbleDm: "#f4ebd3",
      cardActive: "#f8f0da",
      detailsBg: "#f0e5c8",
      dangerBg: "#f3ded6",
      successBg: "#e4ecd8",
      btnSecondary: "#f1e7cd",
      btnTertiary: "#ede2c6",
      border: "#cdb98f",
      borderSoft: "#b99b62",
      borderFaint: "#dccfa8",
      gold: "#8a5a19",
      goldBright: "#a5711f",
      green: "#4e6b52",
      greenText: "#31543c",
      greenBrightText: "#274434",
      danger: "#8c3b2e",
      dangerText: "#6e2a20",
      textDim: "#5d4d33",
      textDimmer: "#6f5d40",
      textMuted: "#87744f",
      textMid: "#4f4028",
      text: "#3b2f1d",
      textBright: "#2e2313",
      textPlayer: "#33281a",
      overlay: "rgba(60, 45, 20, 0.55)",
    },
  },

  modern_dark: {
    label: "Modern Dark",
    vars: {
      bg: "#121417",
      panel: "#1b1f24",
      gameBg: "#14171b",
      modalBg: "#171b20",
      bubblePlayer: "#232930",
      bubbleDm: "#1d2228",
      cardActive: "#20262d",
      detailsBg: "#20252b",
      dangerBg: "#2a1d1f",
      successBg: "#16281e",
      btnSecondary: "#1f242b",
      btnTertiary: "#21262d",
      border: "#2a3038",
      borderSoft: "#454f5b",
      borderFaint: "#232930",
      gold: "#c9a34a",
      goldBright: "#ecc564",
      green: "#63b79a",
      greenText: "#8fd4bd",
      greenBrightText: "#b2e6d3",
      danger: "#b04a3e",
      dangerText: "#eda49a",
      textDim: "#cbd3da",
      textDimmer: "#aab3bd",
      textMuted: "#8b95a1",
      textMid: "#dbe2e8",
      text: "#e6e9ec",
      textBright: "#f2f5f8",
      textPlayer: "#eef1f4",
      overlay: "rgba(5, 7, 10, 0.85)",
    },
  },
};

export const DEFAULT_THEME_ID = "dark_gold";
const THEME_STORAGE_KEY = "pragma_theme_v1";

import { createContext, useContext } from "react";

export const ThemeContext = createContext(THEMES[DEFAULT_THEME_ID].vars);

/** Convenience hook for components: `const t = useTheme();` */
export function useTheme() {
  return useContext(ThemeContext);
}

/** Theme saved in localStorage, or the default one. Client-side only. */
export function loadSavedThemeId() {
  try {
    const id = localStorage.getItem(THEME_STORAGE_KEY);
    return id && THEMES[id] ? id : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveThemeId(id) {
  try {
    if (THEMES[id]) localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {}
}
