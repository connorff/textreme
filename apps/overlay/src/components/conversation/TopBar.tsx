import { Inbox, Sparkles, Pencil, X, CircleUser } from "lucide-react";
import type { ViewMode } from "../../types/viewMode";
import type { UnreadConversation } from "../../types/electron";

interface TopBarProps {
  mode: ViewMode;
  focusedConversation: UnreadConversation | null;
  composeMode: "tab" | "agent";
  onInboxClick: () => void;
  onTabClick: () => void;
  onAgentClick: () => void;
  onClearFocus: () => void;
  onClose: () => void;
  getDisplayName: (conversation: UnreadConversation) => string;
}

export const TopBar = ({
  mode,
  focusedConversation,
  composeMode,
  onInboxClick,
  onTabClick,
  onAgentClick,
  onClearFocus,
  onClose,
  getDisplayName,
}: TopBarProps) => {
  const currentComposeMode =
    mode === "agent" ? "agent" : mode === "tab" ? "tab" : composeMode;

  return (
    <div
      className="flex items-center justify-between p-3"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Top left - inbox and conversation pill */}
      <div
        className="flex items-center gap-1.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={onInboxClick}
          className={`p-1.5 rounded-lg hover:bg-accent/50 transition-colors ${
            mode === "inbox"
              ? "text-foreground bg-accent/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Inbox mode"
        >
          <Inbox className="h-4 w-4" />
        </button>

        {/* Conversation pill - next to inbox */}
        {focusedConversation && (
          <div className="px-2 py-1 rounded-md bg-blue-100 text-blue-600 text-sm flex items-center gap-1.5">
            <CircleUser className="h-4 w-4" />
            <span>{getDisplayName(focusedConversation)}</span>
            <button
              onClick={onClearFocus}
              className="ml-0.5 p-0.5 rounded hover:bg-blue-200 transition-colors flex-shrink-0"
              title="Clear focus"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Top right - tab/agent toggle and close button */}
      <div
        className="flex items-center gap-1.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {/* Tab/Agent mode toggle */}
        <div className="flex items-center bg-accent/30 rounded-lg p-0.5">
          <button
            onClick={onTabClick}
            className={`p-1.5 rounded-md transition-colors ${
              currentComposeMode === "tab"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Tab mode"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onAgentClick}
            className={`p-1.5 rounded-md transition-colors ${
              currentComposeMode === "agent"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Agent mode"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
