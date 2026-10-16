import { useCallback, useEffect, useState } from "react";
import { deviceName } from "@/client/remote-pairing";
import { pushSupport } from "@/client/remote-push";
import { usePhoneTranslation as useTranslation } from "./use-phone-host";
import { hostLabel } from "@/lib/phone-host";
import { readOutbox, removeQueued } from "@/lib/phone-outbox";
import { PHONE_PREFS_KEY, usePhonePrefs } from "@/lib/phone-prefs";
import { formatStorageSize, summarizeClientStorage, type ClientStorageSummary } from "@/lib/phone-storage";
import { useAppStore } from "@/store/app-store";

export type AboutPage = "clientStorage" | "diagnostics" | "licenses" | "legal";

/** The app version built into this page (`scripts/app-about.ts`). */
export const APP_VERSION = __SIRUS_ABOUT__.version;

function readSummary(): ClientStorageSummary {
  try { return summarizeClientStorage(window.localStorage); } catch { return { paired: false, prefsSet: false, outbox: 0, other: 0 }; }
}

/** One stored item: what it is, a line of help, its value and an optional action. */
function StoredItem({ title, help, value, action }: { title: string; help: string; value: string; action?: { label: string; onClick: () => void; danger?: boolean } }) {
  return <div className="mobile-storage-item">
    <span className="mobile-switch-text"><span className="mobile-switch-label">{title}</span><span className="mobile-choice-help">{help}</span></span>
    <span className="mobile-storage-side">
      <span className="mobile-settings-value">{value}</span>
      {action ? <button type="button" className="mobile-storage-action" data-danger={action.danger || undefined} onClick={action.onClick}>{action.label}</button> : null}
    </span>
  </div>;
}

/** What this phone keeps: the pairing stays until Disconnect. */
export function ClientStoragePage() {
  const t = useTranslation();
  const [summary, setSummary] = useState(readSummary);
  const [cache, setCache] = useState<{ bytes: number | null; entries: number } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [cleared, setCleared] = useState(false);
  const measure = useCallback(async () => {
    const entries = typeof caches === "undefined" ? 0 : (await caches.keys().catch(() => [])).length;
    const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
    setCache({ bytes: estimate?.usage ?? null, entries });
  }, []);
  useEffect(() => {
    void measure();
    const refresh = () => setSummary(readSummary());
    window.addEventListener("sirus-outbox", refresh);
    return () => window.removeEventListener("sirus-outbox", refresh);
  }, [measure]);
  const resetPrefs = () => {
    try { window.localStorage.removeItem(PHONE_PREFS_KEY); } catch { /* nothing kept */ }
    usePhonePrefs.getState().activate();
    setSummary(readSummary());
  };
  const discard = () => {
    if (!confirmDiscard) { setConfirmDiscard(true); return; }
    for (const message of readOutbox()) removeQueued(message.id);
    setConfirmDiscard(false);
    setSummary(readSummary());
  };
  const clearCache = async () => {
    if (typeof caches !== "undefined") for (const key of await caches.keys()) await caches.delete(key);
    setCleared(true);
    await measure();
  };
  return <>
    <section>
      <div className="mobile-card">
        <StoredItem title={t("phoneSettings.pairing")} help={t("phoneSettings.pairingHelp")} value={t(summary.paired ? "phoneSettings.paired" : "phoneSettings.notPaired")} />
        <StoredItem title={t("phoneSettings.phonePrefs")} help={t("phoneSettings.phonePrefsHelp")} value={summary.prefsSet ? "" : "—"}
          action={summary.prefsSet ? { label: t("phoneSettings.reset"), onClick: resetPrefs } : undefined} />
        <StoredItem title={t("phoneSettings.outbox")} help={t("phoneSettings.outboxHelp")} value={String(summary.outbox)}
          action={summary.outbox ? { label: t(confirmDiscard ? "phoneSettings.discardConfirm" : "phoneSettings.discard"), onClick: discard, danger: true } : undefined} />
        <StoredItem title={t("phoneSettings.appCache")} help={t("phoneSettings.appCacheHelp")} value={cleared && !cache?.entries ? t("phoneSettings.cleared") : t("phoneSettings.items", { count: cache?.entries ?? 0 })}
          action={cache?.entries ? { label: t("phoneSettings.clear"), onClick: () => void clearCache() } : undefined} />
        <StoredItem title={t("phoneSettings.otherData")} help={t("phoneSettings.otherDataHelp")} value={t("phoneSettings.items", { count: summary.other })} />
      </div>
      {cache?.bytes != null ? <p className="mobile-help">{t("phoneSettings.used")}: {formatStorageSize(cache.bytes)}</p> : null}
      <p className="mobile-help">{t("phoneSettings.storageHelp")}</p>
    </section>
  </>;
}

/** Connection and build facts for a bug report; read here, never sent anywhere. */
export function DiagnosticsPage({ online }: { online: boolean }) {
  const t = useTranslation();
  const host = useAppStore((state) => state.hostInfo);
  const locale = useAppStore((state) => state.settings.locale);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const rows: [string, string][] = [
    [t("phoneSettings.connection"), t(online ? "phoneSettings.connected" : "phoneSettings.disconnected")],
    [t("phoneSettings.host"), host ? `${hostLabel(host, locale)}${host.capabilities ? ` · ${host.capabilities.platform}${host.capabilities.headless ? ` · ${t("phoneSettings.headless")}` : ""}` : ""}` : "—"],
    [t("phoneSettings.macShell"), host?.shell ?? "—"],
    [t("phoneSettings.git"), host?.gitVersion ?? "—"],
    [t("phoneSettings.appVersion"), APP_VERSION || "—"],
    [t("mobile.thisDevice"), deviceName(navigator.userAgent)],
    [t("phoneSettings.installed"), t(standalone ? "phoneSettings.yes" : "phoneSettings.no")],
    [t("phoneSettings.offlineShell"), t(navigator.serviceWorker?.controller ? "phoneSettings.ready" : "phoneSettings.unavailable")],
    [t("phoneSettings.alertsState"), t(pushSupport() === "ready" ? "phoneSettings.ready" : "phoneSettings.unavailable")],
  ];
  return <section>
    <div className="mobile-card">
      {rows.map(([label, value]) => <div key={label} className="mobile-settings-row">
        <span className="mobile-settings-label">{label}</span>
        <span className="mobile-settings-value mobile-diagnostic-value">{value}</span>
      </div>)}
    </div>
    <p className="mobile-help">{t("phoneSettings.diagnosticsHelp")}</p>
  </section>;
}

/** The runtime npm packages in this build and their licenses, read at build time. */
export function LicensesPage() {
  const t = useTranslation();
  return <section>
    <p className="mobile-help mobile-help-top">{t("phoneSettings.licensesHelp")}</p>
    <div className="mobile-card">
      {__SIRUS_ABOUT__.licenses.map((item) => <div key={item.name} className="mobile-settings-row mobile-license-row">
        <span className="mobile-switch-text"><span className="mobile-switch-label">{item.name}</span>{item.version ? <span className="mobile-choice-help">{item.version}</span> : null}</span>
        <span className="mobile-settings-value">{item.license || "—"}</span>
      </div>)}
    </div>
  </section>;
}

export function LegalPage() {
  const t = useTranslation();
  return <section>
    <div className="mobile-card mobile-legal">
      <h3>{t("phoneSettings.legalTitle")}</h3>
      <p>{t("phoneSettings.legalBody")}</p>
    </div>
  </section>;
}
