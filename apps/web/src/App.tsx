import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Placeholder } from './pages/Placeholder'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<AppShell />}>
        <Route path="/overview" element={<Placeholder title="Overview" hint="漏斗与顶部指标（后续对接）。" />} />
        <Route path="/customers" element={<Placeholder title="Customers" hint="客户列表与详情抽屉（后续对接）。" />} />
        <Route path="/data" element={<Placeholder title="Data" hint="合成数据 / CSV / 飞书同步（后续对接）。" />} />
        <Route path="/analysis" element={<Placeholder title="Analysis" hint="一键周焦点分析（后续对接）。" />} />
        <Route path="/settings" element={<Placeholder title="Settings" hint="权重与 LLM / 飞书配置（后续对接）。" />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
