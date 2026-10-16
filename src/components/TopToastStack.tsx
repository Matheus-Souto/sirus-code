import type { ReactNode } from "react";

/**
 * Every toast stacks at the top center of the window, newest below, never in a corner. On the
 * phone it sits below the status bar and above sheets, so the clock and island never hide it.
 */
export function TopToastStack({ children, phone = false }: { children: ReactNode; phone?: boolean }) {
  return <div className={`pointer-events-none fixed ${phone ? "top-[calc(env(safe-area-inset-top)+8px)] z-[130]" : "top-[8px] z-[100]"} left-1/2 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-stretch gap-2 [&>*]:pointer-events-auto`}>{children}</div>;
}
