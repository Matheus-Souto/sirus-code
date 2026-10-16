import type { WorkflowProgress, WorkflowAgent } from "@/client/types";

export type PhaseState = "pending" | "running" | "failed" | "done";

export interface PhaseGroup {
  index: number | null;
  title: string | null;
  state: PhaseState;
  settled: number;
  members: WorkflowAgent[];
}

const settled = (agent: WorkflowAgent) => agent.state === "completed" || agent.state === "failed";

/**
 * A Claude workflow as phases with their members (ADR-115). Declared phases
 * keep their titles; members name their phase by index; members without one come last.
 */
export function workflowGroups(workflow: WorkflowProgress): PhaseGroup[] {
  const indexes = new Set<number>([...workflow.phases.map((phase) => phase.index), ...workflow.agents.flatMap((agent) => agent.phaseIndex == null ? [] : [agent.phaseIndex])]);
  const groups: PhaseGroup[] = [...indexes].sort((a, b) => a - b).map((index) => {
    const members = workflow.agents.filter((agent) => agent.phaseIndex === index);
    return { index, title: workflow.phases.find((phase) => phase.index === index)?.title ?? null, ...summary(members), members };
  });
  const loose = workflow.agents.filter((agent) => agent.phaseIndex == null);
  if (loose.length) groups.push({ index: null, title: null, ...summary(loose), members: loose });
  return groups;
}

function summary(members: WorkflowAgent[]): { state: PhaseState; settled: number } {
  const done = members.filter(settled).length;
  const state: PhaseState = !members.length ? "pending"
    : members.some((agent) => agent.state === "running" || agent.state === "queued") ? (done || members.some((agent) => agent.state === "running") ? "running" : "pending")
    : members.some((agent) => agent.state === "failed") ? "failed" : "done";
  return { state, settled: done };
}
