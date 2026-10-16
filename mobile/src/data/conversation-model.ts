import { useEffect, useMemo } from "react";

import type { AgentProviderId, ExecutionOptions, ProviderModelList } from "@sirus/client/types";
import { composerApproval } from "@sirus/lib/composer-approval";
import { modelExecutionControls } from "@sirus/lib/execution-options";
import { threadSettingsSummary } from "@sirus/lib/phone-chat";
import { providerById } from "@sirus/lib/provider-registry";
import { modelKey } from "@sirus/lib/settings";

import { useSirus } from "./store";

/**
 * A conversation's agent, model and options as the desktop composer reads them: the model's
 * saved reasoning and Fast (`settings.modelExecution`), the access chosen for the provider in this
 * conversation (else what it last used, else the owner's default), and the `execution` a send
 * carries (`AgentComposer.executionFor`).
 */
export function useConversationModel(computerId: string, sessionId: string) {
  const session = useSirus((state) => state.data[computerId]?.sessions.find((item) => item.id === sessionId));
  const settings = useSirus((state) => state.data[computerId]?.settings ?? null);
  const provider: AgentProviderId = session?.agent ?? settings?.defaultAgent ?? "claude";
  const list = useSirus((state) => state.models[`${computerId}:${provider}`]);
  const chosen = useSirus((state) => state.approvals[`${computerId}:${sessionId}`]);

  useEffect(() => {
    if (!list) void useSirus.getState().loadModels(computerId, provider).catch(() => undefined);
  }, [computerId, provider, list]);

  return useMemo(() => {
    const model = session?.model ?? null;
    const models = list?.models ?? [];
    const preference = settings?.modelExecution[modelKey(provider, model ?? "")] ?? {};
    const controls = modelExecutionControls(provider, model, models, preference);
    const definition = providerById(provider);
    const { requested, effective } = composerApproval(provider, session, chosen, false, settings?.defaultApproval);
    const name = settings ? threadSettingsSummary(settings, models, provider, model, null).name : null;
    const plain = provider === "cursor" && !controls.parameterized;
    const execution: ExecutionOptions = {
      effort: plain ? null : controls.effort,
      fast: plain ? false : controls.fast,
      planning: false,
      approval: definition.approvalModes.length ? requested : null,
    };
    return { session, settings, provider, model, models, name: name ?? "Padrão", controls, approval: effective, execution };
  }, [session, settings, provider, list, chosen]);
}

export type CatalogsByProvider = Partial<Record<AgentProviderId, ProviderModelList>>;
