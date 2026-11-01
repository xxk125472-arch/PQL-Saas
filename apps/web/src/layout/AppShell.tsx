import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/overview', label: 'Overview' },
  { to: '/customers', label: 'Customers' },
  { to: '/data', label: 'Data' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/settings', label: 'Settings' },
]

export function AppShell() {
  return (
    <div style={{ minHeight: '100vh', background: '#f6f7f9' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '12px 20px',
          background: '#fff',
          borderBottom: '1px solid #e8e8e8',
        }}
      >
        <strong>PQL Health</strong>
        <nav style={{ display: 'flex', gap: 12 }}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              style={({ isActive }) => ({
                color: isActive ? '#111' : '#666',
                textDecoration: 'none',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <span style={{ marginLeft: 'auto', color: '#888' }}>Day1 骨架</span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
