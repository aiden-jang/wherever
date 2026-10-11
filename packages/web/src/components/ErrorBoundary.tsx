import { PlateState } from "./PlateState.js";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  crashed: boolean;
}

/**
 * Catches render/runtime errors anywhere in the tree so a bug shows a friendly page instead of a
 * blank white screen. On-brand copy; a reload is the escape hatch since state is ephemeral anyway.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  override componentDidCatch(error: unknown): void {
    // Surface it in the console for debugging; the UI stays calm.
    console.error("App crashed:", error);
  }

  override render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <PlateState />
          <h1 className="mt-4 font-display text-state font-bold">Well, that broke.</h1>
          <p className="mt-3 text-muted">
            Something went wrong loading the app. Try reloading. The dinner debate can wait a second.
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="mt-8 rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
