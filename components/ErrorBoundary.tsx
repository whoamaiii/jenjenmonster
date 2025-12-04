import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child
 * component tree, logs them, and displays a fallback UI instead of crashing.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to console (could be sent to error reporting service)
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    this.setState({ errorInfo });

    // In production, you would send this to an error reporting service like:
    // reportError({ error, errorInfo });
  }

  handleReload = (): void => {
    // Clear error state and attempt to recover
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Optionally reload the page for a full reset
    window.location.reload();
  };

  handleReset = (): void => {
    // Just reset the error state without page reload
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
            {/* Error Icon */}
            <div className="text-6xl mb-4">😵</div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-white mb-2 font-cute">
              Oops! Noe gikk galt
            </h1>

            {/* Description */}
            <p className="text-white/60 text-sm mb-6">
              Det oppstod en uventet feil. Ikke bekymre deg -
              fremgangen din er lagret.
            </p>

            {/* Error Details (Development only) */}
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-6 text-left">
                <p className="text-red-400 text-xs font-mono break-all">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-red-300/60 text-[10px] mt-2 overflow-auto max-h-32">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-xl border border-white/10 transition-all active:scale-95"
              >
                Prøv igjen
              </button>
              <button
                onClick={this.handleReload}
                className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all active:scale-95"
              >
                Last på nytt
              </button>
            </div>

            {/* Footer hint */}
            <p className="text-white/30 text-xs mt-6">
              Hvis problemet vedvarer, prøv å oppdatere siden.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
