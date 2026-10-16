import type { AgentProviderId, Connector, ConnectorAuth } from "@/client/types";

/** Connectors (ADR-137): what settings keep, checked like `connectors.rs` does. */
/** Agents that take connectors (`connectors.rs` `SUPPORTED`), in the dialog's order. */
export const CONNECTOR_AGENTS: readonly AgentProviderId[] = ["claude", "codex", "opencode", "cursor", "devin", "hermes"];

export function validConnectorUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && value.trim().length <= 2048;
  } catch {
    return false;
  }
}

/** Settings from disk or another computer, kept to what `connectors.rs` accepts. */
export function normalizeConnectors(value: unknown): Connector[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is Connector => {
    if (!item || typeof item !== "object") return false;
    const connector = item as Connector;
    if (typeof connector.id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(connector.id) || seen.has(connector.id)) return false;
    if (typeof connector.name !== "string" || typeof connector.url !== "string" || !validConnectorUrl(connector.url)) return false;
    seen.add(connector.id);
    return true;
  }).map((connector): Connector => ({
    id: connector.id,
    ...(connector.catalogId ? { catalogId: connector.catalogId } : {}),
    name: connector.name,
    url: connector.url,
    ...(connector.projectId ? { projectId: connector.projectId } : {}),
    agents: Array.isArray(connector.agents) ? [...new Set(connector.agents.filter((agent) => CONNECTOR_AGENTS.includes(agent)))] : [],
    enabled: connector.enabled !== false,
    auth: connector.auth === "token" || connector.auth === "none" ? connector.auth : "oauth" as ConnectorAuth,
  })).slice(0, 64);
}
