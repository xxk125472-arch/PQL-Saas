import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/theme/ThemeProvider'
import type { ThemeMode } from '@/theme/ThemeProvider'

export const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: '浅色', Icon: Sun },
  { value: 'dark', label: '暗色', Icon: Moon },
  { value: 'system', label: '跟随系统', Icon: Monitor },
]

/** Theme radio items, shared by the standalone menu and the user menu. */
export function ThemeRadioItems() {
  const { mode, setMode } = useTheme()
  return (
    <>
      <DropdownMenuLabel>主题</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            <Icon />
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}

export function ThemeMenu() {
  const { resolved } = useTheme()
  const Icon = resolved === 'dark' ? Moon : Sun
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="切换主题">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <ThemeRadioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
