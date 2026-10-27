import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.55)] backdrop-blur-sm"
          dir="rtl"
        >
          <div
            className="w-full max-w-sm rounded-[24px] p-6 text-center space-y-4 shadow-2xl"
            style={{
              background: 'rgba(0, 0, 0, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#F5C84C]/20 border border-[#F5C84C]/40 text-[#F5C84C] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-white">
              حدث خطأ، المرجو المحاولة مرة أخرى
            </h3>
            <div className="pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-gold px-6 py-2.5 rounded-xl font-black text-xs inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>رجوع</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
