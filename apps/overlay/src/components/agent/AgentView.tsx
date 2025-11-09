import { useState, useEffect } from "react";
import type { UnreadConversation, ConversationMessage, AgentOutput, AgentStreamEvent } from "../../types/electron";
import { getDisplayName } from "../../lib/conversationUtils";
import { MessageBubble } from "../conversation/MessageBubble";
import { Send } from "lucide-react";

interface AgentViewProps {
  focusedConversation: UnreadConversation;
  messages: ConversationMessage[];
  onFinalOutputChange: (output: AgentOutput | null) => void;
}

interface AgentMessage {
  role: "user" | "agent";
  content: string;
}

interface ResponseOption {
  text: string;
  reasoning: string;
}

export const AgentView = ({
  focusedConversation,
  messages,
  onFinalOutputChange,
}: AgentViewProps) => {
  const [chatHistory, setChatHistory] = useState<AgentMessage[]>([]);
  const [responses, setResponses] = useState<ResponseOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");

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
            const responseOptions: ResponseOption[] = candidates.map((candidate) => ({
              text: candidate.message,
              reasoning: candidate.reasoning,
            }));
            
            // Build explanation with bullet points
            const explanation = [
              "here are four response options:",
              "",
              ...candidates.map((candidate, idx) => 
                `• option ${idx + 1}: ${candidate.reasoning}`
              ),
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
        { role: "agent", content: "Sorry, I encountered an error. Please try again." },
      ]);
      setIsLoading(false);
    }
  };

  const handleResponseClick = (responseText: string) => {
    // When user clicks a response, we want to send it as a message
    // For now, we'll just log it - the parent component should handle sending
    console.log("Selected response:", responseText);
    // TODO: Implement sending the message via the parent component
  };

  return (
    <div className="flex h-full">
      {/* Left side - Chat history and 4 response panels (70% width) */}
      <div className="w-[60%] border-r border-border flex flex-col">
        {/* Conversation history at the top - 70% height */}
        <div className="h-[60%] p-3 overflow-y-auto">
          <div className="space-y-1">
            {messages.slice(-5).map((msg, msgIdx) => (
              <div
                key={msgIdx}
                className={`flex ${msg.isFromMe ? "justify-end" : "justify-start"}`}
              >
                <MessageBubble message={msg} isFromMe={msg.isFromMe} />
              </div>
            ))}
          </div>
        </div>

        {/* 4 response panels below - 30% height */}
        <div className="h-[40%] p-3">
          {isLoading && responses.length === 0 ? (
            // Show single spinner while loading (original style)
            <div className="flex items-center justify-center h-full">
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  border: "4px solid rgba(0, 0, 0, 0.1)",
                  borderTop: "4px solid #007aff",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              ></div>
            </div>
          ) : (
            // Show 4 response panels in 2 rows, 2 columns
            <div className="grid grid-rows-2 grid-cols-2 gap-2 h-full">
              {responses.map((response, idx) => (
              <button
                key={idx}
                onClick={() => handleResponseClick(response.text)}
                className="p-3 border-none shadow-md rounded-lg transition-all text-left flex items-center justify-center overflow-hidden relative group"
                style={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
              >
                {/* Suggested response text - no bubble */}
                <div className="text-xs text-foreground break-words">
                  {response.text}
                </div>
                {/* Hover overlay with blur and "send" text */}
                <div className="absolute inset-0 bg-blue-500/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
                  <span className="text-white text-sm">send</span>
                  <Send className="h-4 w-4 text-white" />
                </div>
              </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right side - Chat with agent (30% width, full height) */}
      <div className="w-[40%] flex flex-col">
        {/* Chat history - takes full height */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
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
        <div className="p-3 border-t shadow-sm">
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
            placeholder="Ask the agent..."
            disabled={isLoading}
            className="w-full px-3 py-2 border border-border rounded-lg text-xs focus:outline-none focus:ring-none focus:none disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
};

