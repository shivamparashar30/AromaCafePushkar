import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ComingSoon({ module }: { module: string }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card>
        <CardHeader>
          <CardTitle>{module}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {module} isn't built yet in this first pass of the admin dashboard. The route and
            navigation entry are already wired up, so this slots in without restructuring.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
