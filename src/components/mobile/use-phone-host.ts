import { useCallback } from "react";
import { translate } from "@/i18n";
import { fillParams, hostFeatures, hostKind, hostLabel, hostWording } from "@/lib/phone-host";
import { useAppStore } from "@/store/app-store";

/**
 * The phone's `t`: the shared translation, reworded for the host it talks to (ADR-131), so a
 * Linux server is never called "Mac". Parameters are filled in after the rewording.
 */
export function usePhoneTranslation() {
  const locale = useAppStore((state) => state.settings.locale);
  const kind = useAppStore((state) => hostKind(state.hostInfo));
  return useCallback((key: string, params?: Record<string, string | number>) => fillParams(hostWording(translate(locale, key), kind, locale), params), [locale, kind]);
}

/** The host's name for headers and connection rows ("Mac", or the server's name). */
export function useHostLabel(): string {
  const locale = useAppStore((state) => state.settings.locale);
  return useAppStore((state) => hostLabel(state.hostInfo, locale));
}

/** What the host can do; hidden features are left out of the phone's screens. */
export function useHostFeatures() {
  const info = useAppStore((state) => state.hostInfo);
  return hostFeatures(info);
}
