import { Inbox, Sparkles, Pencil, X, CircleUser } from "lucide-react";
import type { ViewMode } from "../../types/viewMode";
import type { UnreadConversation } from "../../types/electron";

interface TopBarProps {
  mode: ViewMode;
  focusedConversation: UnreadConversation | null;
  onInboxClick: () => void;
  onTabClick: () => void;
  onClearFocus: () => void;
  onClose: () => void;
  getDisplayName: (conversation: UnreadConversation) => string;
}

export const TopBar = ({
  mode,
  focusedConversation,
  onInboxClick,
  onTabClick,
  onClearFocus,
  onClose,
  getDisplayName,
}: TopBarProps) => {
  return (
    <div
      className="flex items-center justify-between p-3"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Top left icons */}
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
        <button
          onClick={onTabClick}
          className={`p-1.5 rounded-lg hover:bg-accent/50 transition-colors ${
            mode === "tab"
              ? "text-foreground bg-accent/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Tab mode"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
          title="Agent mode"
        >
          <Sparkles className="h-4 w-4" />
        </button>

        {/* Conversation pill - inline with icons */}
        {focusedConversation && (
          <div className="ml-2 px-2 py-1 rounded-md bg-primary/10 text-primary text-sm flex items-center gap-1.5">
            <CircleUser className="h-4 w-4" />
            <span>{getDisplayName(focusedConversation)}</span>
            <button
              onClick={onClearFocus}
              className="ml-0.5 p-0.5 rounded hover:bg-primary/20 transition-colors flex-shrink-0"
              title="Clear focus"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Top right close button */}
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
        title="Close"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

