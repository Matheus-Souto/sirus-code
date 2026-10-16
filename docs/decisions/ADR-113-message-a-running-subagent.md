# ADR-113: Message a running subagent

**Status:** Accepted (2026-10-11)

## Context

The owner asked to write to one running Claude subagent without stopping the agent that launched it.

## Decision

- A running Claude subagent's card gets a **Message** button next to Background and Stop (ADR-111). It opens a field for a message to that subagent only.
- `steer_subagent` queues the text in the turn's Claude loop. The queue is keyed by the subagent's task id: at most 5 messages per subagent, 32 subagents and 4,000 characters per message.
- Every Claude process registers one `PreToolUse` hook (`hookCallbackIds: ["sy_subagent_steer"]`) when it initializes. Claude then sends a `hook_callback` control request for each tool call. The request input carries `agent_id`, which equals the subagent's task id; the main agent's own calls have no `agent_id`.
  - When messages are waiting for that subagent, the answer is `hookSpecificOutput.additionalContext`. It says the person typed the message while the subagent worked, that it is not tool output, and that it wins over earlier instructions. It also asks the subagent to mention the request in its final report, because the launching agent never saw it.
  - Every other tool call gets `{}` at once. Hook callbacks are answered outside the approval bookkeeping, so long turns are not limited by it.
- The subagent's steps show "Your message reached it" when the message is handed over.

## Consequences

- A message is read only at the subagent's next tool call. One that is still waiting when the subagent finishes is dropped.
- Small models may distrust text that arrives next to a tool result. In testing, Haiku ignored the message as possible injection, while Sonnet followed it.
- Codex, OpenCode and ACP agents answer that their subagents cannot receive messages.
