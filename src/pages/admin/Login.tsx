import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { SectionCard, FormField, AlertMessage } from '../../components/UI'

export default function Login() {
  const navigate = useNavigate()
  const { user, profile, loading: authLoading } = useAuth()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user && profile) {
      navigate('/admin')
    }
  }, [user, profile, authLoading, navigate])

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInErr) {
        setError(signInErr.message)
        setLoading(false)
      } else {
        // Auth state listener in AuthContext will fetch the profile,
        // which then triggers redirect in the useEffect above.
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred during login.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="text-center mb-8">
        <div className="mx-auto w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4 text-indigo-600">
          <Shield className="w-6 h-6 stroke-[2]" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight font-sans">Admin Portal</h1>
        <p className="text-slate-500 mt-2 text-sm font-medium">Sign in to manage appointments and parlor configurations.</p>
      </div>

      {error && (
        <AlertMessage type="error" message={error} className="mb-6" />
      )}

      <SectionCard>
        <form onSubmit={handleLoginSubmit} className="space-y-5">
          <FormField label="Email Address" htmlFor="email" required>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@dogparlour.com"
              disabled={loading}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400 font-medium text-sm disabled:opacity-50"
            />
          </FormField>

          <FormField label="Password" htmlFor="password" required>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400 font-medium text-sm disabled:opacity-50"
            />
          </FormField>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>
      </SectionCard>
    </div>
  )
}

