import { useMemo } from "react";

import { selectRows, transcriptKey, useSirus, type SessionRow } from "./store";
import { conversationBucket, threadStatus, type ConversationBucket, type ThreadStatus } from "./thread-status";

export interface ConversationRow extends SessionRow {
  readonly status: ThreadStatus | null;
  readonly bucket: ConversationBucket | null;
}

/** Every conversation the lists show, with its state and bucket (Início, Conversas, Projetos). */
export function useConversationRows(): ConversationRow[] {
  const data = useSirus((state) => state.data);
  const turns = useSirus((state) => state.turns);
  const order = useSirus((state) => state.prefs.threadOrder);
  return useMemo(() => {
    const now = Date.now();
    return selectRows({ data }, order).map((row) => {
      const status = threadStatus(row.session, turns[transcriptKey(row.computerId, row.session.id)], row.childRequest);
      return { ...row, status, bucket: conversationBucket(status, row.session.lastActivityAt, now) };
    });
  }, [data, turns, order]);
}

/** How many conversations sit in each bucket. */
export function bucketCounts(rows: readonly ConversationRow[]): Record<ConversationBucket, number> {
  const counts = { attention: 0, working: 0, review: 0 };
  for (const row of rows) if (row.bucket) counts[row.bucket] += 1;
  return counts;
}
