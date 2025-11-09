import { RefObject, useRef, useEffect } from "react";
import type {
  ConversationMessage,
  UnreadConversation,
  AgentOutput,
} from "../../types/electron";
import { ScrollArea } from "../ui/scroll-area";
import { MessageGroup } from "./MessageGroup";
import {
  groupMessagesBySender,
  getDisplayName,
} from "../../lib/conversationUtils";

interface MessageListProps {
  messages: ConversationMessage[];
  focusedConversation: UnreadConversation;
  messagesContainerRef?: RefObject<HTMLDivElement>;
  showInChatbox?: boolean;
  agentCandidates?: AgentOutput | null;
}

export const MessageList = ({
  messages,
  focusedConversation,
  messagesContainerRef,
  showInChatbox = false,
  agentCandidates,
}: MessageListProps) => {
  const candidatesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const groupedMessages = groupMessagesBySender(
    messages,
    focusedConversation,
    getDisplayName
  );

  const handleSelectCandidate = async (message: string) => {
    const recipient = focusedConversation.chatIdentifier || "";
    try {
      await window.electronAPI.sendIMessage(recipient, message);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Auto-scroll to bottom when agent candidates appear
  useEffect(() => {
    if (agentCandidates && candidatesRef.current) {
      candidatesRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [agentCandidates]);

  // Expose scrollToBottom functionality to parent
  useEffect(() => {
    if (messagesContainerRef && bottomRef.current) {
      // Create a scrollToBottom function on the ref
      (messagesContainerRef as any).current = {
        scrollToBottom: (instant: boolean = false) => {
          bottomRef.current?.scrollIntoView({
            behavior: instant ? "auto" : "smooth",
            block: "end",
          });
        },
      };
    }
  }, [messagesContainerRef]);

  // When focused conversation changes, jump to bottom instantly
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
  }, [focusedConversation.guid]);

  if (showInChatbox) {
    // Render in chatbox without ScrollArea
    return (
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto mb-3">
        {groupedMessages.map((group, groupIdx) => (
          <MessageGroup key={groupIdx} group={group} />
        ))}
        {agentCandidates && (
          <div ref={candidatesRef} className="mt-3 px-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Agent Suggestions
            </div>
            <div className="flex gap-2 pb-2">
              {agentCandidates.candidates.map((candidate, index) => (
                <div
                  key={index}
                  className="flex-1 border border-border rounded-lg p-2 bg-background hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => handleSelectCandidate(candidate.message)}
                >
                  <div className="text-xs font-medium text-foreground mb-1">
                    {candidate.message}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="text-[10px] text-muted-foreground">
                      {candidate.reasoning}
                    </div>
                    <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                      {(candidate.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    );
  }

  // Render in expandable area with ScrollArea
  return (
    <div className="flex-1 overflow-hidden border-b border-border">
      <ScrollArea className="h-full">
        <div className="px-3 pt-3 pb-3">
          {groupedMessages.map((group, groupIdx) => (
            <MessageGroup key={groupIdx} group={group} />
          ))}
          {agentCandidates && (
            <div ref={candidatesRef} className="mt-4">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Agent Suggestions
              </div>
              <div className="flex gap-2 pb-2">
                {agentCandidates.candidates.map((candidate, index) => (
                  <div
                    key={index}
                    className="flex-1 border border-border rounded-lg p-2 bg-background hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => handleSelectCandidate(candidate.message)}
                  >
                    <div className="text-xs font-medium text-foreground mb-1">
                      {candidate.message}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="text-[10px] text-muted-foreground">
                        {candidate.reasoning}
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                        {(candidate.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
};
