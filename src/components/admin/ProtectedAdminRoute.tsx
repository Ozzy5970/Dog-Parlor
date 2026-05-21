import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

interface ProtectedAdminRouteProps {
  children: React.ReactNode
}

export default function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const { user, profile, loading, error, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        <p className="text-slate-500 mt-4 text-sm font-medium">Checking authorization...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  // Handle case where user is authenticated but has no associated profiles row
  if (error || !profile) {
    return (
      <div className="text-center py-12 max-w-md mx-auto">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
          !
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-600 mb-8 leading-relaxed">
          {error || 'Your account is not linked to a business profile.'}
        </p>
        <button
          onClick={signOut}
          className="inline-flex items-center justify-center px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
        >
          Sign Out
        </button>
      </div>
    )
  }

  return <>{children}</>
}
