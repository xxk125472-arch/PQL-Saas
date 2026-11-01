import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/theme/ThemeProvider'

// ex-toast: top-right, canvas surface, 6–8px radius, stacked shadow.
export function Toaster() {
  const { resolved } = useTheme()
  return (
    <Sonner
      theme={resolved}
      position="top-right"
      duration={3500}
      gap={8}
      containerAriaLabel="通知"
      toastOptions={{
        classNames: {
          toast: '!rounded-lg !border-0 !bg-surface !text-foreground !shadow-l4 !font-sans !text-[13px]',
          description: '!text-body',
          error: '[&_[data-icon]]:!text-destructive',
          success: '[&_[data-icon]]:!text-[var(--hue-mint)]',
        },
      }}
    />
  )
}
