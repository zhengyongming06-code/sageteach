import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8f9fa] px-6 text-center">
          <p className="text-lg font-semibold text-[#0f1b2d]">页面加载出错</p>
          <p className="mt-2 max-w-sm text-sm text-[#5c6b7f]">
            {this.state.error.message || "未知错误"}
          </p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-[#0f1b2d] px-5 py-2.5 text-sm font-medium text-white"
            onClick={() => window.location.reload()}
          >
            刷新重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
