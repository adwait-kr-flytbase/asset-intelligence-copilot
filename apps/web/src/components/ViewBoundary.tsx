import { Component, type ReactNode } from 'react';
// A failed visualization must not take away the conversation or its source controls.
export class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="view-failure" role="alert">
        <strong>This view could not be displayed.</strong>
        <p>
          You can still open its sources or continue the conversation. The underlying result has not
          changed.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
