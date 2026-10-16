import type { Project } from "@sirus/client/types";

/**
 * "Sem projeto" (ADR-135): conversations in a scratch folder of their
 * own, `~/sirus-conversas` on the computer, made the first time and shown as "Sem projeto".
 */
export const SCRATCH_FOLDER = "sirus-conversas";

export function isScratch(project: Pick<Project, "path"> | undefined): boolean {
  return !!project && /\/sirus-conversas\/?$/.test(project.path);
}

/** A project's name as the lists show it. */
export function projectLabel(project: Pick<Project, "name" | "path"> | undefined): string | undefined {
  return isScratch(project) ? "Sem projeto" : project?.name;
}
