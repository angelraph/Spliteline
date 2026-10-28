import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button, Card, EmptyState } from '@/components/ui'

export function NotFound() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={<Compass className="size-5" />}
        title="Page not found"
        body="That link does not lead anywhere. Check the address or head back home."
        action={
          <Link to="/">
            <Button size="sm">Back to home</Button>
          </Link>
        }
      />
    </Card>
  )
}
