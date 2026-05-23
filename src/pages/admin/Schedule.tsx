import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Dog,
  MessageCircle,
  RefreshCw,
  LayoutGrid,
  Plus
} from 'lucide-react'
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  EmptyState,
  LoadingState,
  AlertMessage
} from '../../components/UI'
import { supabase } from '../../lib/supabase'
import { localTimeToUTC, utcToLocalTimeParts } from '../../lib/dateTime'
import {
  fetchAdminBookingsForRange,
  type Booking
} from '../../services/bookingAdminService'
import { createWhatsAppLink, getPendingBookingMessage, getConfirmedBookingMessage, getCancelledBookingMessage } from '../../lib/whatsapp'

// Helper to format price from cents to Rands
const formatPrice = (cents: number): string => {
  return `R ${(cents / 100).toFixed(2)}`
}

// Helper to get full status badge props
const getStatusBadgeProps = (status: Booking['status']) => {
  switch (status) {
    case 'pending':
      return { status: 'pending' as const, label: 'Pending' }
    case 'confirmed':
      return { status: 'active' as const, label: 'Confirmed' }
    case 'completed':
      return { status: 'success' as const, label: 'Completed' }
    case 'cancelled':
      return { status: 'danger' as const, label: 'Cancelled' }
    case 'no_show':
      return { status: 'inactive' as const, label: 'No Show' }
    default:
      return { status: 'inactive' as const, label: status }
  }
}

export default function Schedule() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()

  // Calendar State
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()) // 0-indexed
  const [selectedDateStr, setSelectedDateStr] = useState<string>('')
  const [timezone, setTimezone] = useState('Africa/Johannesburg')

  // Data Loading State
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('the Parlour')

  // Fetch business settings & details
  useEffect(() => {
    if (authLoading || !profile?.business_id) return

    async function loadSettings() {
      try {
        const { data, error: err } = await supabase
          .from('business_settings')
          .select('timezone')
          .eq('business_id', profile!.business_id)
          .maybeSingle()

        if (err) throw err
        if (data?.timezone) {
          setTimezone(data.timezone)
        }

        // Fetch business name
        const { data: bizData } = await supabase
          .from('businesses')
          .select('name')
          .eq('id', profile!.business_id)
          .single()
        
        if (bizData?.name) {
          setBusinessName(bizData.name)
        }
      } catch (e) {
        console.error('Error loading business settings:', e)
      }
    }

    loadSettings()
  }, [profile, authLoading])

  // Generate calendar grid days
  const getDaysInGrid = (year: number, month: number) => {
    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    const startDayOfWeek = firstDayOfMonth.getDay() // 0 = Sunday, 1 = Monday, etc.

    const days: Date[] = []

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, prevMonthLastDay - i))
    }

    // Current month days
    const totalDaysInMonth = lastDayOfMonth.getDate()
    for (let i = 1; i <= totalDaysInMonth; i++) {
      days.push(new Date(year, month, i))
    }

    // Next month padding to fill standard 5 or 6 rows (multiple of 7)
    const totalSlots = days.length <= 35 ? 35 : 42
    const nextMonthPadding = totalSlots - days.length
    for (let i = 1; i <= nextMonthPadding; i++) {
      days.push(new Date(year, month + 1, i))
    }

    return days
  }

  const gridDays = getDaysInGrid(currentYear, currentMonth)

  // Fetch visible bookings when year/month/timezone change
  const loadBookings = async () => {
    if (!profile?.business_id) return
    try {
      setLoading(true)
      setError(null)

      const startGridDate = gridDays[0]
      const endGridDate = gridDays[gridDays.length - 1]

      const startTimeIso = localTimeToUTC(
        startGridDate.getFullYear(),
        startGridDate.getMonth(),
        startGridDate.getDate(),
        0, 0, 0,
        timezone
      ).toISOString()

      const endTimeIso = localTimeToUTC(
        endGridDate.getFullYear(),
        endGridDate.getMonth(),
        endGridDate.getDate(),
        23, 59, 59,
        timezone
      ).toISOString()

      const data = await fetchAdminBookingsForRange(profile.business_id, startTimeIso, endTimeIso)
      setBookings(data)
    } catch (err: any) {
      console.error('Error fetching range bookings:', err)
      setError(err.message || 'Failed to fetch schedule bookings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading || !profile?.business_id) return
    loadBookings()
  }, [currentYear, currentMonth, timezone, profile, authLoading])

  // Select today on initialize
  useEffect(() => {
    const todayLocal = utcToLocalTimeParts(new Date(), timezone)
    const todayStr = `${todayLocal.year}-${String(todayLocal.month + 1).padStart(2, '0')}-${String(todayLocal.day).padStart(2, '0')}`
    setSelectedDateStr(todayStr)
  }, [timezone])

  // Group bookings by local date string
  const bookingsByLocalDateStr: { [key: string]: Booking[] } = {}
  bookings.forEach((booking) => {
    const parts = utcToLocalTimeParts(new Date(booking.start_time), timezone)
    const dateStr = `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
    if (!bookingsByLocalDateStr[dateStr]) {
      bookingsByLocalDateStr[dateStr] = []
    }
    bookingsByLocalDateStr[dateStr].push(booking)
  })

  // Format Helper: format local time for display
  const formatLocalTime = (isoString: string): string => {
    if (!isoString) return ''
    const parts = utcToLocalTimeParts(new Date(isoString), timezone)
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  }

  // Format Helper: format local date for display header
  const formatLocalDateLong = (dateStr: string): string => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    })
  }

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(prev => prev - 1)
    } else {
      setCurrentMonth(prev => prev - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(prev => prev + 1)
    } else {
      setCurrentMonth(prev => prev + 1)
    }
  }

  const handleToday = () => {
    const nowLocal = utcToLocalTimeParts(new Date(), timezone)
    setCurrentYear(nowLocal.year)
    setCurrentMonth(nowLocal.month)
    const todayStr = `${nowLocal.year}-${String(nowLocal.month + 1).padStart(2, '0')}-${String(nowLocal.day).padStart(2, '0')}`
    setSelectedDateStr(todayStr)
  }

  // Month label
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const currentMonthLabel = `${monthNames[currentMonth]} ${currentYear}`

  // Bookings for selected date
  const selectedDayBookings = bookingsByLocalDateStr[selectedDateStr] || []

  // Check if today matches cell
  const isTodayCell = (day: Date) => {
    const todayLocal = utcToLocalTimeParts(new Date(), timezone)
    return (
      day.getFullYear() === todayLocal.year &&
      day.getMonth() === todayLocal.month &&
      day.getDate() === todayLocal.day
    )
  }

  // WhatsApp Link Helper
  const getWhatsAppLink = (booking: Booking) => {
    if (!booking.customer?.phone) return '#'
    const cName = booking.customer.full_name
    const pName = booking.pet?.name || 'your dog'
    const localTime = formatLocalTime(booking.start_time)
    const localDate = formatLocalDateLong(selectedDateStr)
    
    let message = ''
    if (booking.status === 'pending') {
      message = getPendingBookingMessage(cName, businessName, pName, localDate, localTime)
    } else if (booking.status === 'confirmed') {
      message = getConfirmedBookingMessage(cName, businessName, pName, localDate, localTime)
    } else {
      message = getCancelledBookingMessage(cName, businessName, pName, localDate, localTime)
    }

    return createWhatsAppLink(booking.customer.phone, message) || '#'
  }

  if (authLoading) {
    return <LoadingState message="Checking credentials..." />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Appointment Schedule"
        description="Monitor daily customer bookings, check pet notes, and contact owners on a visual monthly calendar."
        action={
          <div className="flex items-center space-x-2">
            <button
              onClick={loadBookings}
              disabled={loading}
              className="p-2 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              title="Refresh Schedule"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => navigate('/admin/bookings/new')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Booking</span>
            </button>
            <button
              onClick={() => navigate('/admin/bookings')}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 flex items-center space-x-1.5"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>List View</span>
            </button>
          </div>
        }
      />

      {error && <AlertMessage type="error" message={error} />}

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left / Main Panel: Calendar Grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            {/* Calendar Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <h2 className="text-lg font-black text-slate-800 tracking-tight">
                {currentMonthLabel}
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrevMonth}
                  className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-650 rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleToday}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  Today
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-650 rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekdays Header */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-slate-400 text-xs uppercase tracking-wider mb-2">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Calendar Grid Cells */}
            <div className="grid grid-cols-7 gap-1.5 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
              {gridDays.map((day, idx) => {
                const cellDateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
                const dayBookings = bookingsByLocalDateStr[cellDateStr] || []
                const isCurrentMonth = day.getMonth() === currentMonth
                const isSelected = cellDateStr === selectedDateStr
                const isToday = isTodayCell(day)

                return (
                  <div
                    key={`${cellDateStr}-${idx}`}
                    onClick={() => setSelectedDateStr(cellDateStr)}
                    className={`min-h-[90px] p-2 bg-white rounded-xl border cursor-pointer transition-all flex flex-col justify-between hover:border-indigo-400 ${
                      isSelected
                        ? 'border-indigo-600 ring-2 ring-indigo-500/10'
                        : isToday
                        ? 'border-indigo-250 bg-indigo-50/20 shadow-inner'
                        : 'border-slate-200/70'
                    } ${!isCurrentMonth ? 'opacity-40 bg-slate-50/40' : ''}`}
                  >
                    {/* Day Number Row */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                          isToday
                            ? 'bg-indigo-600 text-white font-extrabold'
                            : isCurrentMonth
                            ? 'text-slate-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {dayBookings.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                      )}
                    </div>

                    {/* Booking snippets list */}
                    <div className="mt-1.5 space-y-1 flex-1 flex flex-col justify-end">
                      {dayBookings.slice(0, 2).map((booking) => (
                        <div
                          key={booking.id}
                          className="text-[9px] font-bold p-1 rounded-md border flex items-center justify-between gap-1 overflow-hidden truncate bg-slate-50 hover:bg-slate-100"
                        >
                          <span className="text-slate-500 shrink-0">
                            {formatLocalTime(booking.start_time)}
                          </span>
                          <span className="text-slate-800 truncate flex-1 leading-none">
                            {booking.pet?.name || 'Pet'}
                          </span>
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              booking.status === 'pending'
                                ? 'bg-amber-400'
                                : booking.status === 'confirmed'
                                ? 'bg-indigo-600'
                                : booking.status === 'completed'
                                ? 'bg-emerald-500'
                                : 'bg-slate-300'
                            }`}
                          ></span>
                        </div>
                      ))}
                      {dayBookings.length > 2 && (
                        <div className="text-[8.5px] font-bold text-indigo-600 text-center py-0.5 leading-none">
                          +{dayBookings.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Panel: Selected Day Details */}
        <div className="lg:col-span-1">
          <SectionCard
            title="Day Details"
            headerAction={
              <span className="bg-indigo-50 border border-indigo-150 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {selectedDayBookings.length} {selectedDayBookings.length === 1 ? 'Booking' : 'Bookings'}
              </span>
            }
            className="sticky top-24"
          >
            <div className="space-y-4">
              <div className="pb-3 border-b border-slate-150">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected Date</span>
                <p className="font-extrabold text-slate-800 text-sm mt-0.5">
                  {formatLocalDateLong(selectedDateStr)}
                </p>
              </div>

              {loading ? (
                <div className="py-12 flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent"></div>
                </div>
              ) : selectedDayBookings.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    title="No Appointments"
                    description="No bookings have been requested or confirmed for this date."
                    icon={<Calendar className="w-10 h-10 text-slate-300" />}
                  />
                </div>
              ) : (
                <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
                  {selectedDayBookings.map((booking) => {
                    const statusBadge = getStatusBadgeProps(booking.status)
                    const isPriority = booking.status === 'pending' || booking.status === 'confirmed'

                    return (
                      <div
                        key={booking.id}
                        className={`p-4 border rounded-2xl space-y-3 hover:shadow-xs transition-all ${
                          isPriority
                            ? 'border-indigo-150 bg-indigo-50/10'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        {/* Booking Title Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center space-x-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-bold text-slate-700">
                              {formatLocalTime(booking.start_time)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({booking.service?.duration_minutes || 0}m)
                            </span>
                          </div>
                          <StatusBadge status={statusBadge.status} label={statusBadge.label} />
                        </div>

                        {/* Grooming Service Row */}
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-black text-slate-900 leading-snug">
                            {booking.service?.name}
                          </span>
                          <span className="font-extrabold text-slate-500">
                            {booking.service ? formatPrice(booking.service.price_cents) : ''}
                          </span>
                        </div>

                        {/* Owner & Pet grid info */}
                        <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold text-slate-600 bg-slate-50/60 p-2.5 rounded-xl border border-slate-200/40">
                          {/* Owner column */}
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center space-x-1 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                              <User className="w-3 h-3" />
                              <span>Owner</span>
                            </div>
                            <p className="text-slate-800 font-bold truncate leading-tight">
                              {booking.customer?.full_name}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {booking.customer?.phone}
                            </p>
                          </div>

                          {/* Pet column */}
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center space-x-1 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                              <Dog className="w-3 h-3" />
                              <span>Pet</span>
                            </div>
                            <p className="text-slate-800 font-bold truncate leading-tight">
                              {booking.pet?.name}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate capitalize">
                              {booking.pet?.size} 
                              {booking.pet?.breed ? ` • ${booking.pet.breed}` : ''}
                              {booking.pet?.age_years !== undefined && booking.pet?.age_years !== null
                                ? ` • ${booking.pet.age_years} ${booking.pet.age_years === 1 ? 'yr' : 'yrs'}`
                                : ''}
                            </p>
                          </div>
                        </div>

                        {/* Customer Notes */}
                        {booking.customer_notes && (
                          <div className="p-2 border border-slate-200/50 bg-slate-50/30 rounded-xl text-[10px] text-slate-500">
                            <span className="font-bold text-slate-700 block mb-0.5">Customer Notes:</span>
                            <p className="leading-relaxed italic">"{booking.customer_notes}"</p>
                          </div>
                        )}

                        {/* Admin Notes */}
                        {booking.admin_notes && (
                          <div className="p-2 border border-indigo-100 bg-indigo-50/10 rounded-xl text-[10px] text-indigo-700">
                            <span className="font-bold text-indigo-900 block mb-0.5">Admin Notes:</span>
                            <p className="leading-relaxed">"{booking.admin_notes}"</p>
                          </div>
                        )}

                        {/* WhatsApp Contact Action */}
                        {booking.customer?.phone && getWhatsAppLink(booking) !== '#' && (
                          <a
                            href={getWhatsAppLink(booking)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer border border-emerald-200/50"
                          >
                            <MessageCircle className="w-4 h-4 fill-emerald-100" />
                            <span>Contact via WhatsApp</span>
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
