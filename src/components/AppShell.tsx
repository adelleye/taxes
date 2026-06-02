import clsx from "clsx";
import type { ReactNode } from "react";

interface SaveState {
  label: string;
  tone: "saved" | "pending" | "idle";
}

interface AppShellProps {
  /** Left column content: brand, section nav, progress, tax card, pack checks. */
  sidebar: ReactNode;
  saveState?: SaveState;
  children: ReactNode;
}

export function AppShell({ sidebar, saveState, children }: AppShellProps) {
  return (
    <div className="shell">
      <aside className="side" aria-label="Workbench navigation">
        {sidebar}
      </aside>
      <main className="main">
        <div className="topbar">
          {saveState ? (
            <span className={clsx("saved", `saved-${saveState.tone}`)}>
              <span className="saved-dot" />
              {saveState.label}
            </span>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}
