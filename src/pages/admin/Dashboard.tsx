import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { PageHeader } from '../../components/UI'
import { 
  Scissors, 
  CalendarDays, 
  Sliders, 
  LogOut, 
  ArrowRight, 
  ShieldCheck, 
  Mail, 
  Database,
  CalendarRange,
  Clock,
  Calendar,
  Plus,
  BarChart2
} from 'lucide-react'
import { fetchAdminBookings } from '../../services/bookingAdminService'
import { fetchServices } from '../../services/serviceService'

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()

  // State for metrics
  const [metrics, setMetrics] = useState({
    totalBookings: 0,
    pendingApprovals: 0,
    activeServices: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const businessId = profile?.business_id
    if (!businessId) return

    async function loadDashboardData(bid: string) {
      try {
        setLoading(true)
        const [bookingsData, servicesData] = await Promise.all([
          fetchAdminBookings(bid),
          fetchServices(bid)
        ])
        setMetrics({
          totalBookings: bookingsData.length,
          pendingApprovals: bookingsData.filter(b => b.status === 'pending').length,
          activeServices: servicesData.filter(s => s.is_active).length,
        })
      } catch (err) {
        console.error('Error loading dashboard metrics:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData(businessId)
  }, [profile])

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader 
        title="Admin Dashboard" 
        description="Manage parlour appointments, opening hours, and services."
        action={
          <button
            onClick={signOut}
            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-bold rounded-xl transition-all cursor-pointer text-sm flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-red-500/20"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        }
      />

      {/* Admin Metadata Section */}
      <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-xs">
        <div className="flex items-start space-x-3">
          <Mail className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Signed In As</span>
            <p className="text-slate-800 font-semibold mt-1 truncate" title={user?.email}>{user?.email}</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Role</span>
            <p className="text-slate-800 font-semibold mt-1 capitalize">{profile?.role || 'Unknown'}</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <Database className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Business ID</span>
            <p className="text-slate-500 font-mono text-xs mt-1 truncate" title={profile?.business_id}>
              {profile?.business_id || 'Not Associated'}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Bookings</span>
            <p className="text-3xl font-extrabold text-slate-800 mt-2">
              {loading ? (
                <span className="text-slate-300">...</span>
              ) : (
                metrics.totalBookings
              )}
            </p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
            <CalendarRange className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Pending Approvals</span>
            <p className={`text-3xl font-extrabold mt-2 ${metrics.pendingApprovals > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {loading ? (
                <span className="text-slate-300">...</span>
              ) : (
                metrics.pendingApprovals
              )}
            </p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Active Services</span>
            <p className="text-3xl font-extrabold text-slate-800 mt-2">
              {loading ? (
                <span className="text-slate-300">...</span>
              ) : (
                metrics.activeServices
              )}
            </p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <Scissors className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900 font-sans">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link
            to="/admin/bookings/new"
            className="group block p-6 bg-gradient-to-br from-white to-slate-50/50 hover:from-indigo-50/20 hover:to-indigo-50/10 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-650 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                    Manual Booking
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                    Manually create confirmed appointments for phone, WhatsApp, or walk-in clients.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>

          <Link
            to="/admin/analytics"
            className="group block p-6 bg-gradient-to-br from-white to-slate-50/50 hover:from-indigo-50/20 hover:to-indigo-50/10 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-650 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                    Business Analytics
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                    Analyze estimated revenue streams, average booking values, status mix, and booking channels.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>

          <Link
            to="/admin/schedule"
            className="group block p-6 bg-gradient-to-br from-white to-slate-50/50 hover:from-indigo-50/20 hover:to-indigo-50/10 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-650 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                    Appointment Schedule
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                    View daily appointments, dog details, customer notes, and contact owners on a monthly calendar.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>

          <Link
            to="/admin/bookings"
            className="group block p-6 bg-gradient-to-br from-white to-slate-50/50 hover:from-indigo-50/20 hover:to-indigo-50/10 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <CalendarRange className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                    Customer Bookings
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                    Confirm pending bookings, cancel appointments, track completions, and update notes.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>

          <Link
            to="/admin/services"
            className="group block p-6 bg-gradient-to-br from-white to-slate-50/50 hover:from-indigo-50/20 hover:to-indigo-50/10 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <Scissors className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                    Grooming Services
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                    Manage services, pricing, durations, dog sizes, and toggle active status.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>

          <Link
            to="/admin/blocked-slots"
            className="group block p-6 bg-gradient-to-br from-white to-slate-50/50 hover:from-indigo-50/20 hover:to-indigo-50/10 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-650 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                    Closures & Unavailable Times
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                    Manage public holidays, full-day shop closures, staff breaks, and early closures.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>

          <Link
            to="/admin/settings"
            className="group block p-6 bg-gradient-to-br from-white to-slate-50/50 hover:from-indigo-50/20 hover:to-indigo-50/10 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all duration-200 shadow-xs hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">
                    Business Settings
                  </h3>
                  <p className="text-slate-500 text-xs mt-1.5 leading-relaxed font-medium">
                    Update details, booking intervals, advance notices, and opening hours.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>
        </div>
      </div>

      {/* Dynamic Bookings Redirection Card */}
      <div className="bg-slate-50/50 rounded-2xl p-8 border border-slate-200/80 text-center text-slate-500 shadow-xs max-w-xl mx-auto space-y-4">
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
          <CalendarRange className="w-6 h-6" />
        </div>
        <div>
          <p className="font-bold text-slate-700">Manage Appointment Bookings</p>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-medium max-w-sm mx-auto mb-4">
            View pending request status changes, update customer records, add notes, and confirm appointments.
          </p>
          <Link
            to="/admin/bookings"
            className="inline-flex items-center space-x-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <span>Go to Bookings</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

