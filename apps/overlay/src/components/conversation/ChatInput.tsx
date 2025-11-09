import { RefObject } from "react";

interface ChatInputProps {
  draft: string;
  setDraft: (draft: string) => void;
  suggestions: string[];
  selectedSuggestionIndex: number;
  onSuggestionClick: (suggestion: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  suggestionRefs: RefObject<(HTMLDivElement | null)[]>;
  isTyping: boolean;
}

// Helper to format the full preview text
const formatSuggestionPreview = (draft: string, completion: string): string => {
  // Check if this is a conjugate suggestion (multiple messages)
  if (completion.includes("|||")) {
    // For conjugates, just return as-is (we'll format them specially in the render)
    return completion;
  }

  // If draft is empty, just show the suggestion as-is (full message)
  if (!draft.trim()) {
    return completion;
  }
  // Otherwise, append completion to draft
  const needsSpace = draft && !draft.endsWith(" ");
  return draft + (needsSpace ? " " : "") + completion;
};

export const ChatInput = ({
  draft,
  setDraft,
  suggestions,
  selectedSuggestionIndex,
  onSuggestionClick,
  inputRef,
  suggestionRefs,
  isTyping,
}: ChatInputProps) => {
  const showSuggestions = suggestions.length > 0 && !isTyping;

  return (
    <div className="relative w-full">
      {/* User's typed text - always at top in black */}
      <div className="relative min-h-[28px] mb-1 rounded-md focus:none focus-within:none transition-shadow">
        <div className="flex items-center min-h-[28px] px-2 py-1">
          {draft ? (
            <span
              className="text-sm text-black font-normal"
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "14px",
                lineHeight: "20px",
              }}
            >
              {draft}
            </span>
          ) : (
            <span
              className="text-sm text-muted-foreground/50 font-normal"
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "14px",
                lineHeight: "20px",
              }}
            >
              Type a message...
            </span>
          )}
        </div>
        {/* Actual input for typing */}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="absolute inset-0 w-full h-full bg-transparent border-none outline-none text-sm text-transparent caret-blue-500 px-2 py-1"
          aria-label="Type a message"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "14px",
            lineHeight: "20px",
          }}
        />
      </div>

      {/* Autocomplete suggestions - below user text in grey */}
      {showSuggestions && (
        <div className="space-y-0.5">
          {suggestions.map((suggestion, idx) => {
            const fullPreview = formatSuggestionPreview(draft, suggestion);
            const isConjugate = fullPreview.includes("|||");
            const messages = isConjugate
              ? fullPreview.split("|||")
              : [fullPreview];

            return (
              <div
                key={idx}
                ref={(el) => {
                  if (suggestionRefs.current) {
                    suggestionRefs.current[idx] = el;
                  }
                }}
                onClick={() => onSuggestionClick(suggestion)}
                className={`w-full py-1 px-1 text-sm cursor-pointer transition-colors rounded-md ${
                  idx === selectedSuggestionIndex
                    ? "text-gray-500 bg-gray-100"
                    : "text-gray-300 hover:bg-gray-100"
                }`}
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "14px",
                  lineHeight: "20px",
                }}
              >
                {isConjugate ? (
                  <div className="flex flex-col gap-0.5">
                    {messages.map((msg, msgIdx) => (
                      <div key={msgIdx} className="flex items-center gap-1">
                        <span className="text-xs opacity-50">
                          {msgIdx + 1}.
                        </span>
                        <span>{msg}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  fullPreview
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
