import { useState, useCallback } from "react";
import type {
  UnreadConversation,
  AgentOutput,
  ConversationMessage,
} from "../types/electron";

export interface StreamTimelineItem {
  id: string;
  type: "reasoning" | "tool-call" | "tool-result";
  content: string;
  toolName?: string;
  timestamp: number;
}

export interface AgentState {
  isRunning: boolean;
  timeline: StreamTimelineItem[];
  currentReasoning: string;
  finalOutput: AgentOutput | null;
  error: string | null;
  history: Array<{
    query: string;
    output: AgentOutput | null;
    timestamp: number;
  }>;
}

export function useAgent(
  focusedConversation: UnreadConversation | null,
  messages: ConversationMessage[]
) {
  const [state, setState] = useState<AgentState>({
    isRunning: false,
    timeline: [],
    currentReasoning: "",
    finalOutput: null,
    error: null,
    history: [],
  });

  const runAgent = useCallback(
    async (query: string) => {
      if (!focusedConversation) {
        setState((prev) => ({
          ...prev,
          error: "No conversation selected",
        }));
        return;
      }

      // Reset state (keep history)
      const currentQuery = query;
      setState((prev) => ({
        ...prev,
        isRunning: true,
        timeline: [],
        currentReasoning: "",
        finalOutput: null,
        error: null,
      }));

      try {
        const result = await window.electronAPI.runAgent(
          query,
          focusedConversation.guid,
          messages
        );

        if (!result.success || !result.streamId) {
          setState((prev) => ({
            ...prev,
            isRunning: false,
            error: result.error || "Unknown error occurred",
          }));
          return;
        }

        // Set up streaming listener
        const queryForHistory = currentQuery; // Capture query for history

        const cleanup = window.electronAPI.onAgentStream(
          result.streamId,
          (event) => {
            if (event.type === "text-delta" && event.textDelta) {
              // Accumulate reasoning text in currentReasoning
              setState((prev) => ({
                ...prev,
                currentReasoning: prev.currentReasoning + event.textDelta,
              }));
            } else if (event.type === "tool-call" && event.toolName) {
              // Finalize current reasoning chunk if any
              setState((prev) => {
                const newTimeline = [...prev.timeline];
                if (prev.currentReasoning.trim()) {
                  const reasoningItem: StreamTimelineItem = {
                    id: `reasoning-${Date.now()}-${Math.random()}`,
                    type: "reasoning",
                    content: prev.currentReasoning.trim(),
                    timestamp: Date.now(),
                  };
                  newTimeline.push(reasoningItem);
                }

                // Add tool call to timeline
                const toolCallItem: StreamTimelineItem = {
                  id: `tool-call-${Date.now()}-${Math.random()}`,
                  type: "tool-call",
                  content: `Calling ${event.toolName}`,
                  toolName: event.toolName,
                  timestamp: Date.now(),
                };
                newTimeline.push(toolCallItem);

                return {
                  ...prev,
                  timeline: newTimeline,
                  currentReasoning: "",
                };
              });
            } else if (event.type === "tool-result" && event.toolName) {
              // Add tool result to timeline
              setState((prev) => {
                const toolResultItem: StreamTimelineItem = {
                  id: `tool-result-${Date.now()}-${Math.random()}`,
                  type: "tool-result",
                  content: `${event.toolName} completed`,
                  toolName: event.toolName,
                  timestamp: Date.now(),
                };
                return {
                  ...prev,
                  timeline: [...prev.timeline, toolResultItem],
                };
              });
            } else if (event.type === "finish") {
              // Finalize any remaining reasoning
              setState((prev) => {
                const newTimeline = [...prev.timeline];
                if (prev.currentReasoning.trim()) {
                  const reasoningItem: StreamTimelineItem = {
                    id: `reasoning-${Date.now()}-${Math.random()}`,
                    type: "reasoning",
                    content: prev.currentReasoning.trim(),
                    timestamp: Date.now(),
                  };
                  newTimeline.push(reasoningItem);
                }
                return {
                  ...prev,
                  timeline: newTimeline,
                  currentReasoning: "",
                };
              });
            } else if (event.type === "complete" && event.finalOutput) {
              // Finalize any remaining reasoning
              setState((prev) => {
                const newTimeline = [...prev.timeline];
                if (prev.currentReasoning.trim()) {
                  const reasoningItem: StreamTimelineItem = {
                    id: `reasoning-${Date.now()}-${Math.random()}`,
                    type: "reasoning",
                    content: prev.currentReasoning.trim(),
                    timestamp: Date.now(),
                  };
                  newTimeline.push(reasoningItem);
                }

                const newHistory = [
                  ...prev.history,
                  {
                    query: queryForHistory,
                    output: event.finalOutput || null,
                    timestamp: Date.now(),
                  },
                ];

                return {
                  ...prev,
                  isRunning: false,
                  timeline: newTimeline,
                  currentReasoning: "",
                  finalOutput: event.finalOutput || null,
                  history: newHistory,
                };
              });
              cleanup();
            } else if (event.type === "error") {
              setState((prev) => ({
                ...prev,
                isRunning: false,
                error: event.error || "Unknown error occurred",
              }));
              cleanup();
            }
          }
        );
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        }));
      }
    },
    [focusedConversation]
  );

  const reset = useCallback(() => {
    setState({
      isRunning: false,
      timeline: [],
      currentReasoning: "",
      finalOutput: null,
      error: null,
      history: [],
    });
  }, []);

  return {
    state,
    runAgent,
    reset,
  };
}
