export const oasisTokens = {
  color: {
    brand: {
      civicBlue: "#29639F",
      civicBlueDark: "#1F4F80",
      civicBlueInk: "#022551",
      civicBlueSoft: "#EAF2FA",
      sunGold: "#FFB30F",
      sunGoldDark: "#D99400",
      sunGoldSoft: "#FFF3D6",
      sky: "#18AEE2",
      skySoft: "#DDF6FF",
    },
    semantic: {
      success: "#15803D",
      successSoft: "#DCFCE7",
      warning: "#B7791F",
      warningSoft: "#FEF3C7",
      danger: "#B42318",
      dangerSoft: "#FEE4E2",
      info: "#2563EB",
      infoSoft: "#DBEAFE",
    },
    surface: {
      canvas: "#F7FAFC",
      panel: "#FFFFFF",
      panelRaised: "#F9FBFD",
      panelSunken: "#EEF4FA",
      ink: "#122033",
      inkMuted: "#52657A",
      inkFaint: "#7A8A9B",
      border: "#D8E2EC",
      borderStrong: "#AEBFD0",
    },
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    "2xl": "32px",
    "3xl": "48px",
    "4xl": "64px",
    "5xl": "96px",
  },
  radius: {
    xs: "4px",
    sm: "6px",
    md: "8px",
    lg: "10px",
    xl: "12px",
  },
  typography: {
    display: {
      family: "Geist",
      weight: "700",
      usage: "Page titles, module names, report headings",
    },
    body: {
      family: "Geist",
      weight: "400, 500, 600",
      usage: "Forms, tables, dashboard content",
    },
    mono: {
      family: "Geist Mono",
      weight: "400, 500, 600",
      usage: "IDs, reference numbers, codes, generated tokens",
    },
  },
} as const;

export type OasisTokens = typeof oasisTokens;
