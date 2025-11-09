import { useState, useEffect, useRef } from "react";
import type {
  UnreadConversation,
  ConversationMessage,
  AgentOutput,
  AgentStreamEvent,
} from "../../types/electron";
import { MessageBubble } from "../conversation/MessageBubble";
import { Send, Loader2, Check } from "lucide-react";

interface AgentViewProps {
  focusedConversation: UnreadConversation;
  messages: ConversationMessage[];
  onFinalOutputChange: (output: AgentOutput | null) => void;
  onMessageSent?: () => void;
}

interface AgentMessage {
  role: "user" | "agent";
  content: string;
}

interface ResponseOption {
  text: string;
  reasoning: string;
  predictedResponse?: string;
}

export const AgentView = ({
  focusedConversation,
  messages,
  onFinalOutputChange,
  onMessageSent,
}: AgentViewProps) => {
  const [chatHistory, setChatHistory] = useState<AgentMessage[]>([]);
  const [responses, setResponses] = useState<ResponseOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [sendingIndex, setSendingIndex] = useState<number | null>(null);
  const [sentIndex, setSentIndex] = useState<number | null>(null);
  const [shouldScrollMessages, setShouldScrollMessages] = useState(true);

  const showOptions = isLoading || responses.length > 0;
  const historyRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);

  // Reset scroll flag when conversation changes
  useEffect(() => {
    setShouldScrollMessages(true);
  }, [focusedConversation.guid]);

  // Auto-scroll conversation history to bottom only on initial load
  useEffect(() => {
    if (shouldScrollMessages && messages.length > 0) {
    requestAnimationFrame(() => {
      if (historyRef.current) {
        historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }
    });
      setShouldScrollMessages(false);
    }
  }, [messages, shouldScrollMessages]);

  // Auto-scroll agent chat history to bottom when chatHistory changes
  useEffect(() => {
    requestAnimationFrame(() => {
      if (chatHistoryRef.current) {
        chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
      }
    });
  }, [chatHistory]);

  const handleSendPrompt = async () => {
    if (!userPrompt.trim()) return;

    const currentPrompt = userPrompt;
    setUserPrompt("");

    // Add user message to history
    setChatHistory((prev) => [
      ...prev,
      { role: "user", content: currentPrompt },
    ]);

    // Show loading state
    setIsLoading(true);
    setChatHistory((prev) => [
      ...prev,
      { role: "agent", content: "thinking..." },
    ]);

    try {
      // Call the actual agent API
      const result = await window.electronAPI.runAgent(
        currentPrompt,
        focusedConversation.guid,
        messages
      );

      if (!result.success || !result.streamId) {
        throw new Error(result.error || "Failed to start agent");
      }

      // Set up streaming listener
      const cleanup = window.electronAPI.onAgentStream(
        result.streamId,
        (event: unknown) => {
          const agentEvent = event as AgentStreamEvent;

          if (agentEvent.type === "complete" && agentEvent.finalOutput) {
            // Remove "thinking..." message
            setChatHistory((prev) => prev.slice(0, -1));

            // Set the responses with reasoning from candidates
            const candidates = agentEvent.finalOutput.candidates || [];
            const responseOptions: ResponseOption[] = candidates.map(
              (candidate) => ({
                text: candidate.message,
                reasoning: candidate.reasoning,
                predictedResponse: candidate.predictedResponse,
              })
            );

            // Build explanation with predicted responses
            const explanation = [
              "they'd respond with:",
              "",
              ...candidates.map((candidate, idx) => {
                const prediction = candidate.predictedResponse
                  ? candidate.predictedResponse
                  : candidate.reasoning;
                return `  ${idx + 1}  ${prediction}`;
              }),
            ].join("\n");

            // Add agent response with explanations
            setChatHistory((prev) => [
              ...prev,
              { role: "agent", content: explanation },
            ]);

            setResponses(responseOptions);
            setIsLoading(false);

            // Notify parent of the final output
            onFinalOutputChange(agentEvent.finalOutput);

            cleanup();
          } else if (agentEvent.type === "error") {
            setChatHistory((prev) => [
              ...prev.slice(0, -1),
              { role: "agent", content: `Error: ${agentEvent.error}` },
            ]);
            setIsLoading(false);
            cleanup();
          }
        }
      );
    } catch (error) {
      console.error("Agent error:", error);
      setChatHistory((prev) => [
        ...prev.slice(0, -1),
        {
          role: "agent",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
      setIsLoading(false);
    }
  };

  const handleResponseClick = async (responseText: string, index: number) => {
    console.log("[AGENT MODE] Selected response:", responseText);

    const recipient = focusedConversation.chatIdentifier || "";
    console.log("[AGENT MODE] handleResponseClick called:", {
      recipient,
      message: responseText,
      recipientLength: recipient.length,
      messageLength: responseText.length,
      conversationGuid: focusedConversation.guid,
      chatIdentifier: focusedConversation.chatIdentifier,
    });

    // Show spinner on this button
    setSendingIndex(index);

    try {
      const result = await window.electronAPI.sendIMessage(
        recipient,
        responseText
      );
      console.log("[AGENT MODE] sendIMessage result:", result);

      if (result.success) {
        console.log("[AGENT MODE] Message sent successfully!");
        // Show checkmark
        setSendingIndex(null);
        setSentIndex(index);

        // Enable scrolling for the message we just sent
        setShouldScrollMessages(true);

        // Refresh messages after a delay to allow DB to update
        setTimeout(() => {
          onMessageSent?.();
        }, 1000);

        // Clear responses after a brief delay to show the checkmark
        setTimeout(() => {
          setResponses([]);
          setSentIndex(null);
        }, 1500);
      } else {
        console.error("[AGENT MODE] sendIMessage failed:", result.error);
        setSendingIndex(null);
        alert(`Failed to send message: ${result.error}`);
      }
    } catch (error) {
      console.error("[AGENT MODE] Error sending message:", error);
      setSendingIndex(null);
      alert(
        `Error sending message: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  return (
    <div className="flex h-full">
      {/* Left side - Chat history and response panels */}
      <div className="flex flex-col overflow-y-auto w-[60%]">
        {/* Conversation history */}
        <div
          ref={historyRef}
          className={`${showOptions ? "h-[60%]" : "flex-1"} overflow-y-auto p-3`}
        >
          <div className="space-y-1">
            {messages.slice(-20).map((msg, msgIdx) => (
              <div
                key={msgIdx}
                className={`flex ${msg.isFromMe ? "justify-end" : "justify-start"}`}
              >
                <MessageBubble message={msg} isFromMe={msg.isFromMe} />
              </div>
            ))}
          </div>
        </div>

        {/* Response panels (only when loading or options available) */}
        {showOptions && (
          <div className="h-[40%] p-3">
            {isLoading && responses.length === 0 ? (
              // Show 4 placeholder boxes with shimmer animation
              <div className="gap-2 grid grid-cols-2 grid-rows-2 h-full">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="bg-gray-200/50 overflow-hidden relative rounded-lg"
                  >
                    {/* Shimmer animation */}
                    <div
                      className="-translate-x-full absolute animate-shimmer bg-gradient-to-r from-transparent inset-0 to-transparent via-white/40"
                      style={{
                        animation: "shimmer 2s infinite",
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              // Show 4 response panels in 2 rows, 2 columns
              <div className="gap-2 grid grid-cols-2 grid-rows-2 h-full">
                {responses.map((response, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleResponseClick(response.text, idx)}
                    disabled={sendingIndex !== null || sentIndex !== null}
                    className="border-none disabled:cursor-not-allowed flex group items-center justify-center overflow-hidden p-3 relative rounded-lg text-left transition-all"
                    style={{
                      boxShadow: "0 2px 8px 0 rgba(0, 0, 0, 0.15)",
                    }}
                  >
                    {/* Suggested response text - no bubble */}
                    <div className="break-words text-foreground text-xs">
                      {response.text}
                    </div>

                    {/* Hover overlay with blur and "send" text - only show if not sending/sent */}
                    {sendingIndex === null && sentIndex === null && (
                      <div className="absolute backdrop-blur-sm bg-blue-500/40 flex gap-2 group-hover:opacity-100 inset-0 items-center justify-center opacity-0 rounded-lg transition-opacity">
                        <span className="text-sm text-white">send</span>
                        <Send className="h-4 text-white w-4" />
                      </div>
                    )}

                    {/* Spinner overlay - show when this button is sending */}
                    {sendingIndex === idx && (
                      <div className="absolute backdrop-blur-sm bg-blue-500/60 flex inset-0 items-center justify-center rounded-lg">
                        <Loader2 className="animate-spin h-6 text-white w-6" />
                      </div>
                    )}

                    {/* Checkmark overlay - show when this button's message was sent */}
                    {sentIndex === idx && (
                      <div className="absolute animate-in backdrop-blur-sm bg-blue-500/80 duration-300 fade-in flex inset-0 items-center justify-center rounded-lg zoom-in">
                        <Check
                          className="animate-in duration-300 h-4 text-white w-4 zoom-in"
                          strokeWidth={3}
                        />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side - Chat with agent (30% width, full height) */}
      <div className="flex flex-col w-[40%]">
        {/* Chat history - takes full height */}
        <div
          ref={chatHistoryRef}
          className="flex-1 overflow-y-auto p-3 space-y-2"
        >
          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`text-xs flex ${
                msg.role === "user" ? "justify-start" : "justify-start"
              }`}
            >
              <div
                className={`${
                  msg.role === "user"
                    ? "text-foreground"
                    : "text-muted-foreground text-gray-300"
                }`}
              >
                <span style={{ whiteSpace: "pre-line" }}>{msg.content}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Input area - fixed at bottom */}
        <div className="p-3">
          <input
            type="text"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendPrompt();
              }
            }}
            placeholder="What's on your mind?"
            disabled={isLoading}
            className="border border-border disabled:opacity-50 focus:none focus:outline-none focus:ring-none px-3 py-2 rounded-lg text-xs w-full"
          />
        </div>
      </div>
    </div>
  );
};
