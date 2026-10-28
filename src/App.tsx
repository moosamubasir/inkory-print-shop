import { CustomerPortal } from './CustomerPortal'
import { AdminWithLogin } from './AdminDashboard'

export default function App() {
  const path = window.location.pathname

  const isAdmin = path === '/admin' || path.startsWith('/admin/')

  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      }}
    >
      {isAdmin ? <AdminWithLogin /> : <CustomerPortal />}
    </div>
  )
}