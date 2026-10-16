import ArcToast from "@/components/arc/toast/toast";
import { useTranslation } from "@/i18n/use-translation";
import { providerById } from "@/lib/provider-registry";
import { afterToastExit } from "@/lib/toast-exit";
import { useAppStore, type PromptLinkNotice } from "@/store/app-store";
import { restoreReplacedDraft } from "@/store/prompt-links";

/**
 * What a prompt link did (ADR-122). A prompt that had hidden characters gets a warning
 * that stays until it is dismissed; the draft is never sent from here.
 */
export function PromptLinkToast() {
  const t = useTranslation();
  const notice = useAppStore((state) => state.promptLinkNotice);
  if (!notice) return null;
  const { title, description, variant, duration } = noticeText(notice, t);
  const restore = notice.kind === "opened" ? notice.restore : null;
  return <div className="w-full">
    <ArcToast key={notice.id} variant={variant} title={title} description={description} duration={duration}
      dismissLabel={t("common.dismiss")}
      action={restore ? { label: t("promptLink.restore"), onSelect: () => restoreReplacedDraft(restore) } : undefined}
      onOpenChange={(open) => { if (!open) afterToastExit(() => useAppStore.setState((state) => state.promptLinkNotice?.id === notice.id ? { promptLinkNotice: null } : {})); }} />
  </div>;
}

function noticeText(notice: PromptLinkNotice, t: (key: string, params?: Record<string, string | number>) => string): { title: string; description: string; variant: "success" | "error" | "info"; duration: number } {
  switch (notice.kind) {
    case "opened": {
      const provider = notice.provider ? providerById(notice.provider).name : "";
      const notes = [
        notice.hiddenCharacters > 0 ? t("promptLink.hiddenHelp", { count: notice.hiddenCharacters }) : t("promptLink.readFirst"),
        notice.missingProject ? t("promptLink.missingProject", { project: notice.missingProject }) : "",
        notice.providerNote === "applied" ? t("promptLink.providerApplied", { provider }) : "",
        notice.providerNote === "unavailable" ? t("promptLink.providerUnavailable", { provider }) : "",
        notice.providerNote === "modelUnknown" ? t("promptLink.modelUnknown", { provider }) : "",
      ].filter(Boolean);
      // Hidden characters are a warning sign: it stays until dismissed.
      return notice.hiddenCharacters > 0
        ? { title: t("promptLink.hidden"), description: notes.join(" "), variant: "error", duration: 0 }
        : { title: t("promptLink.opened"), description: notes.join(" "), variant: "info", duration: notice.restore || notice.missingProject ? 12_000 : 7_000 };
    }
    case "invalid": return { title: t("promptLink.invalid"), description: t(`promptLink.reason.${notice.reason}`), variant: "error", duration: 8_000 };
    case "noProject": return { title: t("promptLink.noProject"), description: t("promptLink.noProjectHelp"), variant: "info", duration: 8_000 };
    case "copied": return { title: t("promptLink.copied"), description: t("promptLink.copiedHelp"), variant: "success", duration: 3_500 };
    case "copyEmpty": return { title: t("promptLink.copyEmpty"), description: t("promptLink.copyEmptyHelp"), variant: "info", duration: 4_500 };
    case "copyFailed": return { title: t("promptLink.copyFailed"), description: notice.message, variant: "error", duration: 6_000 };
  }
}
