import { useCallback, useEffect, useState } from "react";
import { client } from "@/client";
import type { ReviewGuide, ReviewGuideTarget } from "@/client/types";
import { formatUnknownError } from "@/lib/format-error";
import { reviewGuideKey } from "@/lib/review-guide";

interface Loaded { key: string; guide: ReviewGuide | null; error: string | null }

/** The stored guide for a target, reloaded when an agent writes it (ADR-125). */
export function useReviewGuide(target: ReviewGuideTarget | null) {
  const key = target ? reviewGuideKey(target) : null;
  const encoded = target ? JSON.stringify(target) : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!key || !encoded) return;
    const wanted = JSON.parse(encoded) as ReviewGuideTarget;
    let live = true;
    const load = () => client.reviewGuideAction({ type: "get", target: wanted }).then(
      (guide) => { if (live) setLoaded({ key, guide, error: null }); },
      (reason: unknown) => { if (live) setLoaded({ key, guide: null, error: formatUnknownError(reason) }); },
    );
    void load();
    const listening = client.onReviewGuidesChanged((changed) => { if (changed === key) void load(); });
    return () => { live = false; void listening.then((stop) => stop()).catch(() => undefined); };
  }, [key, encoded]);
  const current = loaded && loaded.key === key ? loaded : null;
  const remove = useCallback(async () => {
    if (!encoded) return;
    await client.reviewGuideAction({ type: "delete", target: JSON.parse(encoded) as ReviewGuideTarget });
    if (key) setLoaded({ key, guide: null, error: null });
  }, [encoded, key]);
  return { guide: current?.guide ?? null, loaded: current !== null, error: current?.error ?? null, remove };
}
