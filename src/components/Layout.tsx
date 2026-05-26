import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  Scissors, 
  CalendarRange, 
  LayoutDashboard, 
  CalendarDays, 
  Sliders, 
  LogOut,
  Calendar,
  BarChart2,
  Users
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AppointmentOutcomePanel from './admin/AppointmentOutcomePanel'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 flex flex-col font-sans selection:bg-indigo-500/10 selection:text-indigo-900">
      {/* Header */}
      {isAdmin && (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="w-full mx-auto px-4 py-3 sm:py-3.5 flex items-center justify-between transition-all duration-200 max-w-6xl">
            <Link to="/" className="flex items-center transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 rounded-lg p-1 hover:opacity-90">
              <img 
                src="/logo-transparent-optimized.png" 
                alt="Groomers" 
                width={120}
                height={52}
                loading="eager"
                decoding="async"
                className="h-10 sm:h-13 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                  if (sibling) sibling.classList.remove('hidden');
                }}
              />
              <span className="hidden font-extrabold tracking-tight text-lg sm:text-xl text-indigo-600 flex items-center gap-2">
                <Scissors className="w-5 h-5 stroke-[2.5]" />
                <span>Groomers</span>
              </span>
            </Link>

            {/* Navigation Links */}
            <nav className="flex items-center space-x-1 sm:space-x-2">
              <Link
                to="/admin"
                className={`px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  location.pathname === '/admin'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title="Admin Dashboard"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden md:inline">Dashboard</span>
              </Link>
              <Link
                to="/admin/bookings"
                className={`px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  location.pathname === '/admin/bookings'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title="Bookings"
              >
                <CalendarRange className="w-4 h-4" />
                <span className="hidden md:inline">Bookings</span>
              </Link>
              <Link
                to="/admin/customers"
                className={`px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  location.pathname === '/admin/customers'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title="Customers"
              >
                <Users className="w-4 h-4" />
                <span className="hidden md:inline">Customers</span>
              </Link>
              <Link
                to="/admin/schedule"
                className={`px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  location.pathname === '/admin/schedule'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title="Appointment Schedule"
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden md:inline">Schedule</span>
              </Link>
              <Link
                to="/admin/analytics"
                className={`px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  location.pathname === '/admin/analytics'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title="Analytics"
              >
                <BarChart2 className="w-4 h-4" />
                <span className="hidden md:inline">Analytics</span>
              </Link>
              <Link
                to="/admin/services"
                className={`px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  location.pathname === '/admin/services'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title="Services"
              >
                <Scissors className="w-4 h-4" />
                <span className="hidden md:inline">Services</span>
              </Link>
              <Link
                to="/admin/blocked-slots"
                className={`px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  location.pathname === '/admin/blocked-slots'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title="Closures & Unavailable Times"
              >
                <CalendarDays className="w-4 h-4" />
                <span className="hidden md:inline">Closures</span>
              </Link>
              <Link
                to="/admin/settings"
                className={`px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  location.pathname === '/admin/settings'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
                title="Settings"
              >
                <Sliders className="w-4 h-4" />
                <span className="hidden md:inline">Settings</span>
              </Link>
              <Link
                to="/"
                className="px-2.5 py-2 rounded-xl text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 transition-all duration-150 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                title="Exit Admin"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Exit</span>
              </Link>
            </nav>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={`flex-grow w-full mx-auto px-4 transition-all duration-200 ${
        isAdmin 
          ? 'max-w-6xl py-8' 
          : location.pathname === '/'
            ? 'max-w-5xl py-6 md:py-10'
            : 'max-w-4xl pt-8 pb-16 sm:pt-12 sm:pb-20'
      }`}>
        {isAdmin ? (
          <div className="min-h-[500px]">
            {children}
          </div>
        ) : location.pathname === '/' ? (
          <div className="min-h-[500px]">
            {children}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 md:p-8 min-h-[500px]">
            {children}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className={`w-full mx-auto px-4 text-center text-xs font-semibold text-slate-500 space-y-2.5 ${
          isAdmin ? 'max-w-6xl' : 'max-w-4xl'
        }`}>
          {!isAdmin && (
            <div className="flex justify-center space-x-4 mb-1">
              <Link to="/privacy" className="text-slate-500 hover:text-indigo-600 transition-colors focus:outline-none focus:underline">Privacy Policy</Link>
              <span className="text-slate-300 font-normal">•</span>
              <Link to="/terms" className="text-slate-500 hover:text-indigo-600 transition-colors focus:outline-none focus:underline">Terms</Link>
              <span className="text-slate-300 font-normal">•</span>
              <Link to="/booking-policy" className="text-slate-500 hover:text-indigo-600 transition-colors focus:outline-none focus:underline">Booking Policy</Link>
            </div>
          )}
          <p>© {new Date().getFullYear()} Dog Parlour. All rights reserved.</p>
        </div>
      </footer>

      {isAdmin && profile?.business_id && (
        <AppointmentOutcomePanel businessId={profile.business_id} />
      )}
    </div>
  )
}

