import { useMemo } from "react";
import { CodeBlock } from "@/components/arc/code-block/code-block";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { parseTranscript } from "@/lib/transcript";

/**
 * Read-only rendered Markdown for the editor's preview toggle, drawn like an agent's reply:
 * tables, task lists, code blocks with their language and copy button, Mermaid diagrams, and
 * workspace paths as file links with their icon when the file's session is known.
 */
export function MarkdownPreview({ source, sessionId, cwd }: { source: string; sessionId?: string; cwd?: string }) {
  const blocks = useMemo(() => parseTranscript(source), [source]);
  return <div className="scroll-thin h-full overflow-y-auto px-6 py-5">
    <div className="markdown-preview selectable mx-auto max-w-[96ch] ui-chat text-text-secondary [overflow-wrap:anywhere]">
      {blocks.map((block, index) => {
        if (block.kind === "code" && block.language.toLowerCase() === "mermaid") return <div key={index} className="my-3"><MermaidDiagram source={block.content} /></div>;
        if (block.kind === "code") return <div key={index} className="my-3"><CodeBlock code={block.content} language={block.language} animateChanges={false} /></div>;
        return <ChatMarkdown key={index} text={block.content} sessionId={sessionId} cwd={cwd} />;
      })}
    </div>
  </div>;
}
