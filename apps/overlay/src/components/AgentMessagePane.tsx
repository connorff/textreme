import { ScrollArea } from "@/components/ui/scroll-area";
import type { UnreadConversation, AgentOutput } from "../types/electron";

interface AgentMessagePaneProps {
  focusedConversation: UnreadConversation;
  agentHistory: Array<{
    query: string;
    output: AgentOutput | null;
    timestamp: number;
  }>;
}

export const AgentMessagePane = ({
  focusedConversation,
  agentHistory,
}: AgentMessagePaneProps) => {
  return (
    <div className="flex-1 overflow-hidden border-l border-border">
      <ScrollArea className="h-full">
        <div className="px-3 pt-3 pb-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Agent History
          </div>
          {agentHistory.length === 0 ? (
            <div className="text-xs text-muted-foreground/50">
              No agent queries yet
            </div>
          ) : (
            <div className="space-y-3">
              {agentHistory.map((item, idx) => (
                <div key={idx} className="border border-border rounded-md p-2">
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
        </div>
      </ScrollArea>
    </div>
  );
};
