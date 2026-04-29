import React from 'react';
import { Wifi } from 'lucide-react';
import { ConversationErrorCard, type ConnectionIssue } from './ConversationErrorCard';

type ConnectionStatusPanelProps = {
  connectionState: string;
  connectionSeverity: 'normal' | 'warning' | 'error';
  connectionIssues: ConnectionIssue[];
  isOpen: boolean;
  onToggle: () => void;
};

// Produces an accessible label from the raw RTC state string, with a special case for
// "Connected (issues detected)" when RTM/agent errors exist while RTC transport is healthy.
function getConnectionLabel(
  connectionState: string,
  connectionSeverity: 'normal' | 'warning' | 'error'
): string {
  if (connectionSeverity !== 'normal' && connectionState === 'CONNECTED') {
    return 'Connected (issues detected)';
  }
  if (connectionState === 'CONNECTED') return 'Connected';
  if (connectionState === 'CONNECTING') return 'Connecting...';
  if (connectionState === 'RECONNECTING') return 'Reconnecting...';
  if (connectionState === 'DISCONNECTING') return 'Disconnecting...';
  return 'Disconnected';
}

export function ConnectionStatusPanel({
  connectionState,
  connectionSeverity,
  connectionIssues,
  isOpen,
  onToggle,
}: ConnectionStatusPanelProps) {
  const healthLabel = connectionSeverity === 'normal' ? 'Good' : getConnectionLabel(connectionState, connectionSeverity);
  return (
    <div className="group relative flex-shrink-0">
      {/* Minimal status affordance: color and ping convey RTC health before the user opens details. */}
      <button
        type="button"
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent"
        aria-label={getConnectionLabel(connectionState, connectionSeverity)}
        aria-expanded={isOpen}
        aria-controls="connection-details-panel"
        onClick={onToggle}
        title={healthLabel}
      >
        <Wifi className="h-4 w-4" />
        <span
          className={`absolute right-1 top-1 inline-flex h-1.5 w-1.5 rounded-full ${
            connectionSeverity === 'normal'
              ? 'bg-green-500'
              : connectionSeverity === 'warning'
                ? 'bg-amber-500'
                : 'bg-red-500'
          }`}
        />
        <span className="sr-only">{healthLabel}</span>
      </button>
      <div className="pointer-events-none absolute -bottom-7 left-1/2 z-10 -translate-x-1/2 rounded bg-foreground px-2 py-1 text-[10px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
        {healthLabel}
      </div>

      {/* Expandable detail panel: current RTC state plus the captured agent/RTM issues. */}
      <div
        id="connection-details-panel"
        className={`fixed top-16 left-1/2 z-20 w-[min(92vw,22rem)] -translate-x-1/2 rounded-md border border-border bg-card/95 p-3 space-y-2 backdrop-blur-sm transition-opacity md:absolute md:left-0 md:top-full md:mt-3 md:w-[24rem] md:translate-x-0 md:translate-y-0 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        role="status"
        aria-live="polite"
        aria-label="Connection details"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold tracking-wide text-foreground">
            Connection Details
          </div>
          <div className="text-[11px] text-muted-foreground">
            RTC {connectionState.toLowerCase()}
          </div>
        </div>
        {connectionIssues.length === 0 ? (
          <div className="text-xs text-muted-foreground">No RTM or agent errors reported.</div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-auto pr-1">
            {connectionIssues.map((issue) => (
              <ConversationErrorCard key={issue.id} issue={issue} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
