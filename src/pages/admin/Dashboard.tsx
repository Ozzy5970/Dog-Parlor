import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { 
  PageHeader,
  SectionCard,
  StatusBadge,
  EmptyState,
  LoadingState,
  AlertMessage
} from '../../components/UI'
import { 
  Scissors, 
  CalendarDays, 
  Sliders, 
  LogOut, 
  ArrowRight, 
  CalendarRange,
  Clock,
  Calendar,
  Plus,
  BarChart2,
  Dog,
  MessageCircle,
  AlertCircle,
  LayoutGrid,
  Check,
  X,
  Loader2,
  TrendingUp,
  Users
} from 'lucide-react'
import { fetchAdminBookingsForRange, updateBookingStatus, type Booking } from '../../services/bookingAdminService'
import { localTimeToUTC, utcToLocalTimeParts } from '../../lib/dateTime'
import { supabase } from '../../lib/supabase'
import { createWhatsAppLink, getPendingBookingMessage, getConfirmedBookingMessage, getCancelledBookingMessage } from '../../lib/whatsapp'

const sourceLabels: Record<string, string> = {
  online: 'Online',
  phone: 'Phone',
  walk_in: 'Walk-in',
  admin: 'Other manual'
}

export default function Dashboard() {
  const { profile, signOut } = useAuth()

  // State
  const [todayBookings, setTodayBookings] = useState<Booking[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [oldestPending, setOldestPending] = useState<Booking | null>(null)
  const [activeServicesCount, setActiveServicesCount] = useState(0)
  const [thisMonthRevenue, setThisMonthRevenue] = useState(0)
  const [timezone, setTimezone] = useState('Africa/Johannesburg')
  const [businessName, setBusinessName] = useState('the Parlour')
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadDashboardData = async (bid: string) => {
    try {
      setLoading(true)
      setError(null)

      // 1. Fetch business settings to get timezone
      const { data: settingsData, error: settingsError } = await supabase
        .from('business_settings')
        .select('timezone')
        .eq('business_id', bid)
        .maybeSingle()

      if (settingsError) throw settingsError
      const tz = settingsData?.timezone || 'Africa/Johannesburg'
      setTimezone(tz)

      // Fetch business name
      const { data: bizData } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', bid)
        .single()
      
      if (bizData?.name) {
        setBusinessName(bizData.name)
      }

      // 2. Compute date ranges
      const now = new Date()
      const localToday = utcToLocalTimeParts(now, tz)
      
      const startTodayUTC = localTimeToUTC(localToday.year, localToday.month, localToday.day, 0, 0, 0, tz)
      const endTodayUTC = localTimeToUTC(localToday.year, localToday.month, localToday.day, 23, 59, 59, tz)
      
      const startMonthUTC = localTimeToUTC(localToday.year, localToday.month, 1, 0, 0, 0, tz)
      const lastDayOfMonth = new Date(localToday.year, localToday.month + 1, 0).getDate()
      const endMonthUTC = localTimeToUTC(localToday.year, localToday.month, lastDayOfMonth, 23, 59, 59, tz)

      // 3. Run queries in parallel
      const [todayData, monthData, pendingResponse, servicesCountResponse] = await Promise.all([
        fetchAdminBookingsForRange(bid, startTodayUTC.toISOString(), endTodayUTC.toISOString()),
        fetchAdminBookingsForRange(bid, startMonthUTC.toISOString(), endMonthUTC.toISOString()),
        supabase
          .from('bookings')
          .select(`
            *,
            customer:customers (
              full_name,
              phone,
              email
            ),
            pet:pets (
              name,
              breed,
              size,
              age_years
            ),
            service:services (
              name,
              duration_minutes,
              price_cents
            )
          `)
          .eq('business_id', bid)
          .eq('status', 'pending')
          .order('start_time', { ascending: true }),
        supabase
          .from('services')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', bid)
          .eq('is_active', true)
      ])

      if (pendingResponse.error) throw pendingResponse.error
      if (servicesCountResponse.error) throw servicesCountResponse.error

      // 4. Update state
      setTodayBookings(todayData)
      setPendingCount(pendingResponse.data.length)
      setOldestPending(pendingResponse.data[0] || null)
      setActiveServicesCount(servicesCountResponse.count || 0)

      const revenue = monthData
        .filter(b => b.status === 'confirmed' || b.status === 'completed')
        .reduce((sum, b) => sum + (b.service?.price_cents || 0), 0)
      setThisMonthRevenue(revenue)

    } catch (err: any) {
      console.error('Error loading dashboard data:', err)
      setError(err.message || 'Failed to load daily operations data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const businessId = profile?.business_id
    if (!businessId) return
    loadDashboardData(businessId)
  }, [profile])

  // Action handlers
  const handleApproveBooking = async (bookingId: string) => {
    if (!profile?.business_id) return
    try {
      setActionLoading(bookingId)
      await updateBookingStatus(profile.business_id, bookingId, 'confirmed')
      await loadDashboardData(profile.business_id)
    } catch (err: any) {
      console.error('Error approving booking:', err)
      setError(err.message || 'Failed to confirm appointment.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelBooking = async (bookingId: string) => {
    if (!profile?.business_id) return
    try {
      setActionLoading(bookingId)
      await updateBookingStatus(profile.business_id, bookingId, 'cancelled')
      await loadDashboardData(profile.business_id)
    } catch (err: any) {
      console.error('Error cancelling booking:', err)
      setError(err.message || 'Failed to cancel appointment.')
    } finally {
      setActionLoading(null)
    }
  }

  // Format helpers
  const formatPrice = (cents: number): string => {
    return `R ${(cents / 100).toFixed(2)}`
  }

  const formatLocalTime = (isoString: string): string => {
    if (!isoString) return ''
    const parts = utcToLocalTimeParts(new Date(isoString), timezone)
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  }

  // Next Appointment selector logic
  // Filters today's bookings that end in the future, prioritizing confirmed, then pending
  const now = new Date()
  const activeToday = todayBookings.filter(
    b => new Date(b.end_time) >= now && (b.status === 'confirmed' || b.status === 'pending')
  )
  const confirmedToday = activeToday.filter(b => b.status === 'confirmed')
  const pendingToday = activeToday.filter(b => b.status === 'pending')

  confirmedToday.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  pendingToday.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const nextAppointment = confirmedToday[0] || pendingToday[0] || null

  // Helpers to format date and time parts separately for WhatsApp messages
  const formatLocalDatePart = (isoString: string): string => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleDateString('en-ZA', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const formatLocalTimePart = (isoString: string): string => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // WhatsApp template link for next appointment
  const getWhatsAppLink = (booking: Booking) => {
    if (!booking.customer?.phone) return '#'
    const cName = booking.customer.full_name
    const pName = booking.pet?.name || 'your dog'
    const dateStr = formatLocalDatePart(booking.start_time)
    const timeStr = formatLocalTimePart(booking.start_time)
    
    let message = ''
    if (booking.status === 'pending') {
      message = getPendingBookingMessage(cName, businessName, pName, dateStr, timeStr)
    } else if (booking.status === 'confirmed') {
      message = getConfirmedBookingMessage(cName, businessName, pName, dateStr, timeStr)
    } else {
      message = getCancelledBookingMessage(cName, businessName, pName, dateStr, timeStr)
    }

    return createWhatsAppLink(booking.customer.phone, message) || '#'
  }

  // Chronological list of today's bookings
  const sortedTodayBookings = [...todayBookings].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )

  if (loading && todayBookings.length === 0) {
    return <LoadingState message="Loading operations dashboard..." />
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader 
        title="Daily Operations Center" 
        description="Daily calendar schedules, grooming sessions, and appointment request workflows."
        action={
          <button
            onClick={signOut}
            className="px-4 py-2 border border-red-200 text-red-650 hover:bg-red-50 hover:border-red-300 font-bold rounded-xl transition-all cursor-pointer text-sm flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-red-500/20"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        }
      />

      {error && <AlertMessage type="error" message={error} />}

      {/* 1. Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Today's Bookings */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Today's Bookings</span>
            <p className="text-2xl font-black text-slate-800 mt-1">
              {todayBookings.length}
            </p>
          </div>
          <div className="w-10 h-10 bg-indigo-50 text-indigo-650 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Pending Requests */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Pending Requests</span>
            <p className={`text-2xl font-black mt-1 ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {pendingCount}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pendingCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Estimated Revenue */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-550 uppercase tracking-wider block font-sans">Month Revenue</span>
            <p className="text-2xl font-black text-slate-800 mt-1">
              {formatPrice(thisMonthRevenue)}
            </p>
          </div>
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Active Services */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Active Services</span>
            <p className="text-2xl font-black text-slate-800 mt-1">
              {activeServicesCount}
            </p>
          </div>
          <div className="w-10 h-10 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center">
            <Scissors className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Main Dashboard Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Next & Today's Appointments */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Next Appointment Card */}
          <SectionCard 
            title="Next Grooming Session" 
            headerAction={
              nextAppointment && (
                <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-150 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                  Upcoming Today
                </span>
              )
            }
          >
            {nextAppointment ? (
              <div className="space-y-4">
                {/* Time & Pet Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 gap-2">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-xl font-black text-sm shadow-sm flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatLocalTime(nextAppointment.start_time)}</span>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-base leading-tight flex items-center gap-1.5">
                        <Dog className="w-4 h-4 text-slate-400" />
                        {nextAppointment.pet?.name}
                      </h4>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5 capitalize">
                        {nextAppointment.pet?.size} Dog 
                        {nextAppointment.pet?.breed ? ` • ${nextAppointment.pet.breed}` : ''}
                        {nextAppointment.pet?.age_years !== undefined && nextAppointment.pet?.age_years !== null
                          ? ` • ${nextAppointment.pet.age_years} ${nextAppointment.pet.age_years === 1 ? 'yr' : 'yrs'}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div>
                    {(() => {
                      const status = nextAppointment.status === 'confirmed' ? 'active' as const : 'pending' as const
                      const label = nextAppointment.status === 'confirmed' ? 'Confirmed' : 'Pending Review'
                      return <StatusBadge status={status} label={label} />
                    })()}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-semibold">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Service</span>
                    <p className="text-indigo-600 font-extrabold mt-0.5">{nextAppointment.service?.name}</p>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">{nextAppointment.service?.duration_minutes} mins • {formatPrice(nextAppointment.service?.price_cents || 0)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Owner</span>
                    <p className="text-slate-800 font-bold mt-0.5">{nextAppointment.customer?.full_name}</p>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">{nextAppointment.customer?.phone}</p>
                  </div>
                </div>

                {/* Notes if available */}
                {nextAppointment.customer_notes && (
                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl text-xs text-slate-600 italic">
                    <span className="font-bold text-slate-700 block not-italic mb-1 text-[10px] uppercase tracking-wider">Client request notes:</span>
                    "{nextAppointment.customer_notes}"
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  {nextAppointment.customer?.phone && (
                    <a
                      href={getWhatsAppLink(nextAppointment)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <MessageCircle className="w-4 h-4 fill-emerald-100" />
                      <span>WhatsApp Owner</span>
                    </a>
                  )}
                  <Link
                    to="/admin/bookings"
                    className="w-full sm:w-auto px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl text-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    View in Bookings List
                  </Link>
                </div>
              </div>
            ) : (
              <EmptyState 
                title="No Upcoming Bookings Today" 
                description="All appointments for today are completed, cancelled, or there are no bookings left."
                icon={<CalendarRange className="w-8 h-8 text-slate-300" />}
              />
            )}
          </SectionCard>

          {/* Today's Appointments List */}
          <SectionCard 
            title="Today's Schedule" 
            headerAction={
              <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                {sortedTodayBookings.length} {sortedTodayBookings.length === 1 ? 'Booking' : 'Bookings'}
              </span>
            }
          >
            {sortedTodayBookings.length === 0 ? (
              <EmptyState 
                title="No Appointments Scheduled Today" 
                description="Go to manual booking to register an appointment, or verify slots settings."
                icon={<Calendar className="w-8 h-8 text-slate-300" />}
              />
            ) : (
              <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-1">
                {sortedTodayBookings.map((b) => (
                  <div key={b.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-3.5 min-w-0">
                      {/* Local Time block */}
                      <span className="text-xs font-black text-slate-900 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg shrink-0">
                        {formatLocalTime(b.start_time)}
                      </span>
                      {/* Pet & Owner information */}
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-800 text-sm truncate flex items-center gap-1">
                          <Dog className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{b.pet?.name}</span>
                          <span className="font-medium text-slate-550 text-xs truncate">({b.customer?.full_name})</span>
                        </p>
                        <p className="text-slate-450 font-bold text-xs truncate mt-0.5">
                          {b.service?.name} ({b.service?.duration_minutes}m)
                        </p>
                      </div>
                    </div>
                    {/* Status indicator */}
                    <div className="shrink-0 flex items-center space-x-2">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-450 bg-slate-50 border border-slate-150 px-1.5 py-0.5 rounded-md hidden sm:inline-block">
                        {sourceLabels[b.source] || b.source}
                      </span>
                      {(() => {
                        let status: 'pending' | 'active' | 'success' | 'danger' | 'inactive' = 'inactive'
                        let label: string = b.status
                        if (b.status === 'pending') { status = 'pending'; label = 'Pending' }
                        else if (b.status === 'confirmed') { status = 'active'; label = 'Confirmed' }
                        else if (b.status === 'completed') { status = 'success'; label = 'Completed' }
                        else if (b.status === 'cancelled') { status = 'danger'; label = 'Cancelled' }
                        else if (b.status === 'no_show') { status = 'inactive'; label = 'No Show' }
                        return <StatusBadge status={status} label={label} />
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

        </div>

        {/* Right Column: Needs Attention & Quick Actions */}
        <div className="space-y-6">
          
          {/* Needs Attention Card */}
          <SectionCard 
            title="Needs Attention" 
            headerAction={
              pendingCount > 0 ? (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full uppercase tracking-wider">
                  Action Required
                </span>
              ) : null
            }
          >
            {oldestPending ? (
              <div className="space-y-4">
                <div className="p-3.5 bg-amber-50/50 border border-amber-200/80 rounded-2xl space-y-3">
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center space-x-1 text-[10px] font-black text-amber-700 uppercase tracking-wider">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Oldest Pending Booking</span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">
                      ID: {oldestPending.id.slice(0, 8)}
                    </span>
                  </div>
                  
                  <div className="text-xs font-semibold space-y-1 text-slate-600">
                    <p className="font-extrabold text-slate-800 text-sm leading-snug">
                      {oldestPending.pet?.name} ({oldestPending.customer?.full_name})
                    </p>
                    <p className="font-extrabold text-indigo-650">{oldestPending.service?.name}</p>
                    <p className="text-slate-500 font-bold mt-1 block">
                      Requested: {new Date(oldestPending.start_time).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })} at {formatLocalTime(oldestPending.start_time)}
                    </p>
                  </div>

                  {oldestPending.customer_notes && (
                    <p className="text-[10px] text-slate-500 italic bg-white p-2 rounded-lg border border-slate-100 truncate">
                      "{oldestPending.customer_notes}"
                    </p>
                  )}

                  {/* WhatsApp contact button */}
                  {oldestPending.customer?.phone && getWhatsAppLink(oldestPending) !== '#' && (
                    <a
                      href={getWhatsAppLink(oldestPending)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer border border-emerald-250/60 mb-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5 fill-emerald-100" />
                      <span>WhatsApp Client</span>
                    </a>
                  )}
                  
                  {/* Approve/Cancel Quick buttons */}
                  <div className="flex items-center space-x-2 pt-1 border-t border-slate-150/40">
                    <button
                      onClick={() => handleApproveBooking(oldestPending.id)}
                      disabled={actionLoading === oldestPending.id}
                      className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-55"
                    >
                      {actionLoading === oldestPending.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      )}
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleCancelBooking(oldestPending.id)}
                      disabled={actionLoading === oldestPending.id}
                      className="flex-1 py-1.5 border border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-slate-600 text-xs font-bold rounded-xl flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-55"
                    >
                      {actionLoading === oldestPending.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>

                <div className="text-center pt-1">
                  <Link
                    to="/admin/bookings"
                    className="inline-flex items-center space-x-1 text-xs font-extrabold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    <span>View All {pendingCount} Pending Requests</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2.5">
                  <Check className="w-5 h-5 stroke-[2.5]" />
                </div>
                <p className="font-extrabold text-slate-800 text-sm">All Bookings Caught Up</p>
                <p className="text-xs text-slate-450 mt-1 font-semibold">Zero pending requests need attention right now.</p>
              </div>
            )}
          </SectionCard>

          {/* Quick Actions Panel */}
          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-2 gap-3">
              {/* Add Booking */}
              <Link
                to="/admin/bookings/new"
                className="p-3 bg-indigo-50/40 hover:bg-indigo-50 border border-indigo-150/60 rounded-xl text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-1.5"
              >
                <Plus className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-extrabold text-slate-850 group-hover:text-indigo-750">Add Booking</span>
              </Link>
              
              {/* View Schedule */}
              <Link
                to="/admin/schedule"
                className="p-3 bg-blue-50/40 hover:bg-blue-50 border border-blue-150/60 rounded-xl text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-1.5"
              >
                <Calendar className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-extrabold text-slate-850 group-hover:text-blue-750">View Schedule</span>
              </Link>

              {/* View Bookings */}
              <Link
                to="/admin/bookings"
                className="p-3 bg-emerald-50/40 hover:bg-emerald-50 border border-emerald-150/60 rounded-xl text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-1.5"
              >
                <LayoutGrid className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-extrabold text-slate-855 group-hover:text-emerald-750">View Bookings</span>
              </Link>

              {/* Closures */}
              <Link
                to="/admin/blocked-slots"
                className="p-3 bg-amber-50/40 hover:bg-amber-50 border border-amber-150/60 rounded-xl text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-1.5"
              >
                <CalendarDays className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-extrabold text-slate-850 group-hover:text-amber-750">Closures</span>
              </Link>

              {/* Services */}
              <Link
                to="/admin/services"
                className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-1.5"
              >
                <Scissors className="w-4 h-4 text-slate-500 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-extrabold text-slate-850 group-hover:text-slate-900">Services</span>
              </Link>

              {/* Analytics */}
              <Link
                to="/admin/analytics"
                className="p-3 bg-indigo-50/40 hover:bg-indigo-50 border border-indigo-100/60 rounded-xl text-center transition-all cursor-pointer group flex flex-col items-center justify-center space-y-1.5"
              >
                <BarChart2 className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-extrabold text-slate-850 group-hover:text-indigo-700">Analytics</span>
              </Link>

              {/* Customers */}
              <Link
                to="/admin/customers"
                className="col-span-2 p-3 bg-teal-50/40 hover:bg-teal-50 border border-teal-150/60 rounded-xl text-center transition-all cursor-pointer group flex items-center justify-center space-x-2"
              >
                <Users className="w-4 h-4 text-teal-600 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-extrabold text-slate-850 group-hover:text-teal-750">Customers & Pet History</span>
              </Link>
            </div>
            
            <div className="pt-4 border-t border-slate-100 mt-4">
              <Link
                to="/admin/settings"
                className="w-full py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span>Parlour Settings</span>
              </Link>
            </div>
          </SectionCard>

        </div>

      </div>
    </div>
  )
}

