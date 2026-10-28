import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Card, ErrorState } from '@/components/ui'

interface State {
  failed: boolean
}

/** Last line of defence: a render crash shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Spliteline render error', error.message, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
        <Card className="w-full">
          <ErrorState title="Something went wrong" body="The page hit an unexpected problem. Reloading usually fixes it. Your funds are not affected." />
          <div className="flex justify-center pb-6">
            <Button onClick={() => window.location.reload()}>Reload page</Button>
          </div>
        </Card>
      </div>
    )
  }
}
