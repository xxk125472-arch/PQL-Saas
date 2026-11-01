import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Settings, Sparkles } from 'lucide-react'
import { AppShell } from './layout/AppShell'
import { AuthPage } from './auth/AuthPage'
import { Placeholder } from './pages/Placeholder'

// Route-level code splitting keeps the sign-in bundle small.
const Overview = lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })))
const Customers = lazy(() => import('./pages/Customers').then((m) => ({ default: m.Customers })))
const DataCenter = lazy(() => import('./pages/DataCenter').then((m) => ({ default: m.DataCenter })))

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/register" element={<AuthPage key="register" mode="register" />} />
      <Route element={<AppShell />}>
        <Route path="/overview" element={<Overview />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/data" element={<DataCenter />} />
        <Route
          path="/analysis"
          element={
            <Placeholder
              title="分析"
              description="选择官方 Skill 与参数包，一键生成本周客户运营焦点报告。"
              icon={<Sparkles />}
              hint="一键分析（weekly_focus_v1 与规则回退）计划在第二周接入。"
            />
          }
        />
        <Route
          path="/settings"
          element={
            <Placeholder
              title="设置"
              description="健康分与 PQL 权重、阈值、飞书与 LLM 配置。"
              icon={<Settings />}
              hint="权重与集成配置计划在第二周接入。"
            />
          }
        />
      </Route>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  )
}
