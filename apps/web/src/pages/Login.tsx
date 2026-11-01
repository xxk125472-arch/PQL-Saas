import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function Login() {
  const nav = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    // Day1: form shell only; auth wiring in W1
    if (!identifier || !password) return
    nav('/overview')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f7f9' }}>
      <form
        onSubmit={onSubmit}
        style={{ width: 400, background: '#fff', padding: 28, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.06)' }}
      >
        <h1 style={{ marginTop: 0 }}>PQL Health</h1>
        <p style={{ color: '#666', marginTop: -8 }}>登录（Day1 占位）</p>
        <label style={{ display: 'block', marginBottom: 12 }}>
          邮箱或用户名
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
            autoComplete="username"
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
            autoComplete="current-password"
          />
        </label>
        <button type="submit" style={{ width: '100%', padding: 10 }}>登录</button>
        <p style={{ marginBottom: 0, marginTop: 12 }}>
          还没有账号？<Link to="/register">注册</Link>
        </p>
      </form>
    </div>
  )
}
