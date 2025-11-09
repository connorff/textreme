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

  // Auto-run agent with default query when view first loads
  useEffect(() => {
    // Only run if not already running and no previous history
    if (!state.isRunning && state.history.length === 0 && !state.error) {
      const defaultQuery = "Suggest natural replies to the last message";
      runAgent(defaultQuery);
    }
  }, [focusedConversation.guid, state.isRunning, state.history.length, state.error, runAgent]); // Re-run when conversation changes

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || state.isRunning) return;
    await runAgent(query.trim());
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Agent interface - compact for chatbox area */}
      <div className="bg-background flex flex-col gap-2 h-full justify-end overflow-hidden p-3">
        {/* Scrollable content area - grows from top, pushes input down */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-2 pr-2">
            {/* Agent History */}
            {state.history.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-muted-foreground text-xs">
                  History
                </div>
                {state.history.map((item, idx) => (
                  <div
                    key={idx}
                    className="border border-border p-2 rounded-md"
                  >
                    <div className="mb-1 text-muted-foreground text-xs">
                      Query:
                    </div>
                    <div className="mb-2 text-foreground text-xs">
                      {item.query}
                    </div>
                    {item.output && (
                      <>
                        <div className="mb-1 text-muted-foreground text-xs">
                          Candidates:
                        </div>
                        <div className="space-y-1">
                          {item.output.candidates.map((candidate, cIdx) => (
                            <div
                              key={cIdx}
                              className="bg-accent/30 px-2 py-1 rounded text-xs"
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
              <div className="bg-destructive/10 border border-destructive/20 px-2 py-1.5 rounded-md text-destructive text-xs">
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
                  <div className="bg-accent/20 border border-border p-2 rounded-md">
                    <div className="flex font-medium gap-1 items-center mb-1 text-muted-foreground text-xs">
                      <div className="animate-pulse bg-blue-500 h-1.5 rounded-full w-1.5" />
                      Reasoning...
                    </div>
                    <div className="text-foreground text-xs whitespace-pre-wrap">
                      {state.currentReasoning}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Query input - textarea with send button (grows bottom-up like ChatInput) */}
        <form onSubmit={handleSubmit} className="flex-shrink-0 relative w-full">
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
            placeholder="Refine suggestions or ask for something specific..."
            disabled={state.isRunning}
            className="bg-transparent border-none disabled:opacity-50 outline-none placeholder:text-muted-foreground/50 pr-10 resize-none text-foreground text-sm w-full"
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
          <div className="absolute bottom-0 p-1 right-0">
            {state.isRunning ? (
              <div className="flex h-6 items-center justify-center w-6">
                <Loader2 className="animate-spin h-3.5 text-muted-foreground w-3.5" />
              </div>
            ) : (
              <Button
                type="submit"
                disabled={!query.trim()}
                size="icon"
                variant="ghost"
                className="h-6 rounded-full w-6"
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
      <div className="bg-accent/10 border border-border p-2 rounded-md">
        <div className="font-medium mb-1 text-muted-foreground text-xs">
          Reasoning
        </div>
        <div className="text-foreground text-xs whitespace-pre-wrap">
          {item.content}
        </div>
      </div>
    );
  }

  if (item.type === "tool-call") {
    return (
      <div className="bg-blue-50 border border-border dark:bg-blue-950/20 p-2 rounded-md">
        <div className="dark:text-blue-400 flex font-medium gap-1.5 items-center text-blue-600 text-xs">
          <Wrench className="h-3 w-3" />
          {item.content}
        </div>
      </div>
    );
  }

  if (item.type === "tool-result") {
    return (
      <div className="bg-green-50 border border-border dark:bg-green-950/20 p-2 rounded-md">
        <div className="dark:text-green-400 flex font-medium gap-1.5 items-center text-green-600 text-xs">
          <CheckCircle2 className="h-3 w-3" />
          {item.content}
        </div>
      </div>
    );
  }

  return null;
}
