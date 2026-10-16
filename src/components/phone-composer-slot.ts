import { createContext, type ReactNode } from "react";
import type { AgentProviderId, ApprovalMode, Session } from "@/client/types";
import type { ComposerContext } from "@/lib/composer-context";

/** What the composer hands to the phone's "+" button. */
export interface PhoneAddMenuProps {
  owner: string;
  disabled: boolean;
  context: ComposerContext;
  onChange: (context: ComposerContext) => void;
}

/** What the composer hands to the phone's model button and its Thread settings sheet. */
export interface PhoneModelButtonProps {
  session: Session | null;
  provider: AgentProviderId;
  model: string | null;
  /** Model, reasoning and speed wait while the agent works, as on the Mac. */
  modelDisabled: boolean;
  accessDisabled: boolean;
  approvalByProvider: ComposerContext["approvalByProvider"];
  planning: boolean;
  onModelChange: (provider: AgentProviderId, model: string | null) => void;
  onApproval: (provider: AgentProviderId, mode: ApprovalMode) => void;
}

/**
 * The phone conversation (ADR-129) gives the shared composer its own "+" menu and model
 * button. The desktop leaves this empty and keeps its controls;
 * the composer itself never imports phone code.
 */
export interface PhoneComposerSlot {
  placeholder: string;
  addMenu: (props: PhoneAddMenuProps) => ReactNode;
  modelButton: (props: PhoneModelButtonProps) => ReactNode;
}

export const PhoneComposerSlotContext = createContext<PhoneComposerSlot | null>(null);
