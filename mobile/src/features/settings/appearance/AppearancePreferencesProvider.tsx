import { createContext, use, useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Appearance, Platform, useColorScheme } from "react-native";
import { ScopedTheme, ScopedVariables, Uniwind } from "uniwind";

import { resolveAppearance, resolveAppearancePreferences, type ResolvedAppearance } from "../../../lib/appearancePreferences";
import { getMobileThemeRuntimeVariables } from "../../../lib/mobileThemeVariables";
import {
  createMobileThemePairPatch,
  createMobileThemeSelectionPatch,
  normalizeMobileThemeMode,
  resolveMobileThemeIds,
  type MobileThemeAppearance,
  type MobileThemeId,
  type MobileThemeIds,
  type MobileThemeMode,
  type MobileThemeVariables,
} from "../../../lib/mobileTheme";
import { createMobileThemeRuntimeOperations, getMobileUniwindThemeName, type MobileThemeRuntimeState } from "../../../lib/mobileThemeRuntime";
import { useSirus } from "../../../data/store";

/**
 * Appearance for the Sirus app: system,
 * light or dark; a theme per appearance; text, terminal and code sizes. The choices live in this
 * iPhone's preferences (`useSirus` prefs: `colorScheme` and `appearance`).
 */
interface AppearancePreferencesContextValue {
  readonly appearance: ResolvedAppearance;
  readonly themeId: MobileThemeId;
  readonly themeIds: MobileThemeIds;
  readonly themeMode: MobileThemeMode;
  readonly themeAppearance: MobileThemeAppearance;
  readonly systemColorsAvailable: boolean;
  readonly systemColorsActive: boolean;
  readonly themeVariables: MobileThemeVariables;
  readonly themeVariablesByAppearance: Readonly<Record<MobileThemeAppearance, MobileThemeVariables>>;
  readonly systemColorPalettes: null;
  readonly isReady: boolean;
  readonly setThemeIdForAppearance: (appearance: MobileThemeAppearance, value: MobileThemeId) => void;
  readonly setThemeIdForBothAppearances: (value: MobileThemeId) => void;
  readonly setThemeMode: (value: MobileThemeMode) => void;
  readonly setBaseFontSize: (value: number) => void;
  readonly setTerminalFontSize: (value: number | null) => void;
  readonly setCodeFontSize: (value: number | null) => void;
  readonly setCodeWordBreak: (value: boolean) => void;
}

const AppearancePreferencesContext = createContext<AppearancePreferencesContextValue | null>(null);

export function AppearancePreferencesProvider(props: { readonly children: ReactNode }) {
  const stored = useSirus((state) => state.prefs.appearance);
  const themeMode = normalizeMobileThemeMode(useSirus((state) => state.prefs.colorScheme));
  const systemColorScheme: MobileThemeAppearance = useColorScheme() === "light" ? "light" : "dark";
  const themeAppearance = themeMode === "system" ? systemColorScheme : themeMode;
  const resolvedIds = resolveMobileThemeIds(stored);
  const themeIds = useMemo<MobileThemeIds>(() => ({ light: resolvedIds.light, dark: resolvedIds.dark }), [resolvedIds.light, resolvedIds.dark]);
  const themeId = themeIds[themeAppearance];
  const preferences = useMemo(() => resolveAppearancePreferences(stored), [stored]);
  const appearance = useMemo(() => resolveAppearance(preferences), [preferences]);
  const themeVariablesByAppearance = useMemo(() => ({
    light: getMobileThemeRuntimeVariables(themeIds.light, "light", Platform.OS),
    dark: getMobileThemeRuntimeVariables(themeIds.dark, "dark", Platform.OS),
  }), [themeIds]);
  const themeVariables = themeVariablesByAppearance[themeAppearance];
  const activeThemeName = getMobileUniwindThemeName(themeId, themeAppearance);

  // Text sizes and the forced appearance go to the runtime once per change.
  const applied = useRef<MobileThemeRuntimeState | null>(null);
  useLayoutEffect(() => {
    const next: MobileThemeRuntimeState = { baseFontSize: preferences.baseFontSize, themeAppearance, themeMode };
    for (const operation of createMobileThemeRuntimeOperations(applied.current, next)) {
      if (operation.kind === "update-text-variables") Uniwind.updateCSSVariables(operation.themeName, operation.variables);
      else if (operation.kind === "set-appearance-mode") Appearance.setColorScheme(operation.themeMode === "system" ? "unspecified" : operation.appearance);
    }
    applied.current = next;
  }, [preferences.baseFontSize, themeAppearance, themeMode]);

  const updateAppearance = useCallback((patch: PhoneAppearancePatch) => {
    const prefs = useSirus.getState().prefs;
    useSirus.getState().setPrefs({ appearance: { ...prefs.appearance, ...patch } });
  }, []);
  const setThemeMode = useCallback((value: MobileThemeMode) => {
    if (value === "system") Appearance.setColorScheme("unspecified");
    useSirus.getState().setPrefs({ colorScheme: value });
  }, []);
  const setThemeIdForAppearance = useCallback((target: MobileThemeAppearance, value: MobileThemeId) => {
    updateAppearance(createMobileThemeSelectionPatch(themeIds, themeAppearance, target, value) as PhoneAppearancePatch);
  }, [themeAppearance, themeIds, updateAppearance]);
  const setThemeIdForBothAppearances = useCallback((value: MobileThemeId) => updateAppearance(createMobileThemePairPatch(value) as PhoneAppearancePatch), [updateAppearance]);
  const setBaseFontSize = useCallback((value: number) => updateAppearance({ baseFontSize: value }), [updateAppearance]);
  const setTerminalFontSize = useCallback((value: number | null) => updateAppearance({ terminalFontSize: value }), [updateAppearance]);
  const setCodeFontSize = useCallback((value: number | null) => updateAppearance({ codeFontSize: value }), [updateAppearance]);
  const setCodeWordBreak = useCallback((value: boolean) => updateAppearance({ codeWordBreak: value }), [updateAppearance]);

  const value = useMemo<AppearancePreferencesContextValue>(() => ({
    appearance, themeId, themeIds, themeMode, themeAppearance, systemColorsAvailable: false, systemColorsActive: false,
    themeVariables, themeVariablesByAppearance, systemColorPalettes: null, isReady: true,
    setThemeIdForAppearance, setThemeIdForBothAppearances, setThemeMode, setBaseFontSize, setTerminalFontSize, setCodeFontSize, setCodeWordBreak,
  }), [appearance, themeId, themeIds, themeMode, themeAppearance, themeVariables, themeVariablesByAppearance,
    setThemeIdForAppearance, setThemeIdForBothAppearances, setThemeMode, setBaseFontSize, setTerminalFontSize, setCodeFontSize, setCodeWordBreak]);

  return <AppearancePreferencesContext.Provider value={value}>
    <ScopedTheme theme={activeThemeName}>
      <ScopedVariables variables={themeVariables}>{props.children}</ScopedVariables>
    </ScopedTheme>
  </AppearancePreferencesContext.Provider>;
}

type PhoneAppearancePatch = Partial<ReturnType<typeof useSirus.getState>["prefs"]["appearance"]>;

export function useAppearancePreferences(): AppearancePreferencesContextValue {
  const context = use(AppearancePreferencesContext);
  if (!context) throw new Error("useAppearancePreferences must be used within AppearancePreferencesProvider");
  return context;
}
