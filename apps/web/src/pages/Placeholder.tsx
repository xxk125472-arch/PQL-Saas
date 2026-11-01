import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Page, PageHeader } from '@/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'

type Props = { title: string; description?: string; hint: string; icon?: ReactNode }

export function Placeholder({ title, description, hint, icon }: Props) {
  return (
    <Page title={title}>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          icon={icon}
          title="即将上线"
          description={hint}
          actions={
            <Button variant="outline" asChild>
              <Link to="/overview">返回总览</Link>
            </Button>
          }
        />
      </Card>
    </Page>
  )
}
