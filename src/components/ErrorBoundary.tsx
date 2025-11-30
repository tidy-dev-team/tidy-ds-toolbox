import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error Boundary caught error:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "20px",
            margin: "20px",
            border: "2px solid #f44336",
            borderRadius: "8px",
            backgroundColor: "#ffebee",
          }}
        >
          <h2 style={{ color: "#c62828", marginTop: 0 }}>
            ⚠️ Something went wrong
          </h2>
          <details style={{ whiteSpace: "pre-wrap", marginBottom: "20px" }}>
            <summary style={{ cursor: "pointer", marginBottom: "10px" }}>
              Error Details
            </summary>
            <div
              style={{
                backgroundColor: "#fff",
                padding: "10px",
                borderRadius: "4px",
                fontSize: "12px",
                fontFamily: "monospace",
                overflow: "auto",
                maxHeight: "200px",
              }}
            >
              <strong>Error:</strong> {this.state.error?.toString()}
              <br />
              <br />
              <strong>Stack:</strong>
              <pre>{this.state.errorInfo?.componentStack}</pre>
            </div>
          </details>
          <button
            onClick={this.handleReset}
            style={{
              padding: "10px 20px",
              backgroundColor: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Reset and Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
