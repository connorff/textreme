import { useState, useRef, useEffect } from "react";
import { useAgent, type StreamTimelineItem } from "../hooks/useAgent";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import type {
  UnreadConversation,
  AgentOutput,
  ConversationMessage,
} from "../types/electron";
import { Loader2, Send, Wrench, CheckCircle2 } from "lucide-react";

interface AgentViewProps {
  focusedConversation: UnreadConversation;
  messages: ConversationMessage[];
}

export const AgentView = ({
  focusedConversation,
  messages,
  onFinalOutputChange,
}: AgentViewProps & {
  onFinalOutputChange?: (output: AgentOutput | null) => void;
}) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { state, runAgent, reset } = useAgent(focusedConversation, messages);

  // Notify parent when final output changes
  useEffect(() => {
    if (onFinalOutputChange) {
      onFinalOutputChange(state.finalOutput);
    }
  }, [state.finalOutput, onFinalOutputChange]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      const scrollHeight = inputRef.current.scrollHeight;
      inputRef.current.style.height = `${Math.min(scrollHeight, 120)}px`; // Max 120px
    }
  }, [query]);

  // Focus input when component mounts
  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  // Reset when conversation changes
  useEffect(() => {
    reset();
    setQuery("");
  }, [focusedConversation.guid, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || state.isRunning) return;
    await runAgent(query.trim());
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Agent interface - compact for chatbox area */}
      <div className="flex flex-col justify-end h-full p-3 gap-2 bg-background overflow-hidden">
        {/* Scrollable content area - grows from top, pushes input down */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-2 pr-2">
            {/* Agent History */}
            {state.history.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  History
                </div>
                {state.history.map((item, idx) => (
                  <div
                    key={idx}
                    className="border border-border rounded-md p-2"
                  >
                    <div className="text-xs text-muted-foreground mb-1">
                      Query:
                    </div>
                    <div className="text-xs text-foreground mb-2">
                      {item.query}
                    </div>
                    {item.output && (
                      <>
                        <div className="text-xs text-muted-foreground mb-1">
                          Candidates:
                        </div>
                        <div className="space-y-1">
                          {item.output.candidates.map((candidate, cIdx) => (
                            <div
                              key={cIdx}
                              className="text-xs bg-accent/30 rounded px-2 py-1"
                            >
                              {candidate.message}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Error display */}
            {state.error && (
              <div className="px-2 py-1.5 text-xs text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                {state.error}
              </div>
            )}

            {/* Streaming timeline */}
            {(state.timeline.length > 0 || state.currentReasoning) && (
              <div className="space-y-2">
                {state.timeline.map((item) => (
                  <StreamTimelineItemComponent key={item.id} item={item} />
                ))}
                {state.currentReasoning && (
                  <div className="border border-border rounded-md p-2 bg-accent/20">
                    <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                      Reasoning...
                    </div>
                    <div className="text-xs text-foreground whitespace-pre-wrap">
                      {state.currentReasoning}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Query input - textarea with send button (grows bottom-up like ChatInput) */}
        <form onSubmit={handleSubmit} className="relative w-full flex-shrink-0">
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (query.trim() && !state.isRunning) {
                  runAgent(query.trim());
                }
              }
            }}
            placeholder="Ask the agent to compose a reply..."
            disabled={state.isRunning}
            className="w-full bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground/50 resize-none pr-10 disabled:opacity-50"
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "14px",
              lineHeight: "20px",
              minHeight: "28px",
              maxHeight: "120px",
            }}
            rows={1}
          />
          {/* Send button - bottom right */}
          <div className="absolute bottom-0 right-0 p-1">
            {state.isRunning ? (
              <div className="h-6 w-6 flex items-center justify-center">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Button
                type="submit"
                disabled={!query.trim()}
                size="icon"
                variant="ghost"
                className="h-6 w-6 rounded-full"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

function StreamTimelineItemComponent({ item }: { item: StreamTimelineItem }) {
  if (item.type === "reasoning") {
    return (
      <div className="border border-border rounded-md p-2 bg-accent/10">
        <div className="text-xs font-medium text-muted-foreground mb-1">
          Reasoning
        </div>
        <div className="text-xs text-foreground whitespace-pre-wrap">
          {item.content}
        </div>
      </div>
    );
  }

  if (item.type === "tool-call") {
    return (
      <div className="border border-border rounded-md p-2 bg-blue-50 dark:bg-blue-950/20">
        <div className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
          <Wrench className="h-3 w-3" />
          {item.content}
        </div>
      </div>
    );
  }

  if (item.type === "tool-result") {
    return (
      <div className="border border-border rounded-md p-2 bg-green-50 dark:bg-green-950/20">
        <div className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          {item.content}
        </div>
      </div>
    );
  }

  return null;
}
