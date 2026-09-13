// VS Code language resolver for the central string table (Appendix A).
import * as vscode from "vscode";
import { STRINGS, interpolate, type I18nKey, type I18nLang } from "./i18nStrings.js";

/** Column order for language matching (first prefix wins). */
const PREFIX_TO_LANG: [string, I18nLang][] = [
  ["zh", "zh"],
  ["ja", "ja"],
  ["ko", "ko"],
  ["et", "et"],
  ["uk", "uk"],
  ["es", "es"],
  ["pt", "pt"],
  ["fr", "fr"],
  ["de", "de"],
];

/** Resolve the VS Code display language to a string-table column. */
function column(): I18nLang {
  const lang = vscode.env.language.toLowerCase();
  for (const [prefix, col] of PREFIX_TO_LANG) {
    if (lang.startsWith(prefix)) return col;
  }
  return "en";
}

/** Resolve one key to the current VS Code language; default English. */
export function t(key: I18nKey, vars?: Record<string, string>): string {
  const text = STRINGS[key][column()];
  return vars ? interpolate(text, vars) : text;
}

/** Current document language code for <html lang=...>. */
export function langCode(): string {
  switch (column()) {
    case "zh":
      return "zh-CN";
    case "pt":
      return "pt-BR";
    default:
      return column();
  }
}

/** Localized boot payload for the dependency-free Mux Trail webview script. */
export function muxTrailStrings(): {
  open: string;
  close: string;
  title: string;
  trail: string;
  solitaire: string;
  description: string;
  score: string;
  solitaireProgress: string;
  instructions: string;
  solitaireInstructions: string;
  ready: string;
  gameOver: string;
  won: string;
  solitaireWon: string;
  restart: string;
  newDeal: string;
  stock: string;
  waste: string;
  foundation: string;
  invalidMove: string;
} {
  return {
    open: t("muxTrail.open"),
    close: t("muxTrail.close"),
    title: t("muxTrail.title"),
    trail: t("muxTrail.trail"),
    solitaire: t("muxTrail.solitaire"),
    description: t("muxTrail.description"),
    score: t("muxTrail.score"),
    solitaireProgress: t("muxTrail.solitaireProgress"),
    instructions: t("muxTrail.instructions"),
    solitaireInstructions: t("muxTrail.solitaireInstructions"),
    ready: t("muxTrail.ready"),
    gameOver: t("muxTrail.gameOver"),
    won: t("muxTrail.won"),
    solitaireWon: t("muxTrail.solitaireWon"),
    restart: t("muxTrail.restart"),
    newDeal: t("muxTrail.newDeal"),
    stock: t("muxTrail.stock"),
    waste: t("muxTrail.waste"),
    foundation: t("muxTrail.foundation"),
    invalidMove: t("muxTrail.invalidMove"),
  };
}
