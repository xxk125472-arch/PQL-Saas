import { Link } from 'react-router-dom'

type Props = { title: string; hint?: string }

export function Placeholder({ title, hint }: Props) {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: '0 0 8px' }}>{title}</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>{hint ?? 'Day1 占位页，后续对接 API。'}</p>
      <p>
        <Link to="/overview">Overview</Link>
        {' · '}
        <Link to="/login">Login</Link>
      </p>
    </div>
  )
}
