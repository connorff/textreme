import { RefObject } from "react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { CommandList, CommandItem } from "@/components/ui/command";

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
  return (
    <div className="relative">
      <Popover
        open={suggestions.length > 0 && !isTyping}
        onOpenChange={() => {
          // Controlled by suggestions state
        }}
      >
        {/* Input */}
        <div className="relative min-h-[28px]">
          <div className="flex items-center min-h-[28px]">
            {/* User's typed text */}
            {draft ? (
              <span
                className="text-sm text-foreground font-normal"
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
            className="absolute inset-0 w-full h-full bg-transparent border-none outline-none text-sm text-transparent caret-foreground"
            aria-label="Type a message"
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "14px",
              lineHeight: "20px",
            }}
          />
        </div>

        {/* Autocomplete dropdown - above input */}
        <PopoverContent
          side="top"
          align="start"
          sideOffset={4}
          className="p-0 w-auto max-w-full border-gray-100 absolute bottom-full mb-1 left-0"
          style={{
            boxShadow:
              "0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)",
          }}
        >
          <CommandList className="max-h-48">
            {suggestions.map((suggestion, idx) => (
              <CommandItem
                key={idx}
                ref={(el) => {
                  if (suggestionRefs.current) {
                    suggestionRefs.current[idx] = el;
                  }
                }}
                onClick={() => onSuggestionClick(suggestion)}
                selected={idx === selectedSuggestionIndex}
                className="px-3 py-1.5 text-sm cursor-pointer"
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "14px",
                  lineHeight: "20px",
                }}
              >
                {suggestion}
              </CommandItem>
            ))}
          </CommandList>
        </PopoverContent>
      </Popover>
    </div>
  );
};

