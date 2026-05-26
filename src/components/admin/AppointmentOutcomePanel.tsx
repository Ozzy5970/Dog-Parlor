import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { updateBookingStatus, type Booking } from '../../services/bookingAdminService'
import { 
  AlertTriangle, 
  Check, 
  X, 
  MessageCircle, 
  ChevronLeft, 
  ChevronRight, 
  Minus, 
  ExternalLink,
  Clock,
  Dog,
  User,
  Scissors
} from 'lucide-react'
import { createWhatsAppLink, getTodayReminderMessage } from '../../lib/whatsapp'

interface AppointmentOutcomePanelProps {
  businessId: string
}

export default function AppointmentOutcomePanel({ businessId }: AppointmentOutcomePanelProps) {
  const navigate = useNavigate()
  const [dueBookings, setDueBookings] = useState<Booking[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    return localStorage.getItem('arrival_panel_minimized') === 'true'
  })
  const [error, setError] = useState<string | null>(null)
  
  // Track last seen count of fresh due bookings to auto-expand on new items
  const [prevFreshCount, setPrevFreshCount] = useState(0)
  const [hasInitialized, setHasInitialized] = useState(false)

  // Fetch due bookings: confirmed and start_time <= now
  const fetchDueBookings = async () => {
    try {
      const now = new Date()
      const nowStr = now.toISOString()
      
      const { data, error: err } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers (
            id,
            full_name,
            surname,
            phone,
            email
          ),
          pet:pets (
            id,
            name,
            breed,
            size
          ),
          service:services (
            name,
            duration_minutes,
            price_cents
          )
        `)
        .eq('business_id', businessId)
        .eq('status', 'confirmed')
        .lte('start_time', nowStr)
        .order('start_time', { ascending: true })

      if (err) throw err
      
      const bookings = (data || []) as any as Booking[]
      setDueBookings(bookings)
      
      // Calculate fresh bookings (start_time within the last 60 minutes)
      const STALE_THRESHOLD_MINUTES = 60
      const thresholdTime = new Date(now.getTime() - STALE_THRESHOLD_MINUTES * 60 * 1000)
      const freshBookings = bookings.filter(b => new Date(b.start_time) >= thresholdTime)

      if (!hasInitialized) {
        // On initial load, only open the modal if there are fresh due bookings
        // and user hasn't explicitly minimized it. If there are only stale, keep it minimized.
        if (freshBookings.length > 0) {
          const minimizedPref = localStorage.getItem('arrival_panel_minimized') === 'true'
          setIsMinimized(minimizedPref)
        } else {
          setIsMinimized(true)
        }
        setHasInitialized(true)
      } else {
        // On subsequent polls, auto-expand the panel only when a new fresh due booking arrives
        if (freshBookings.length > prevFreshCount) {
          setIsMinimized(false)
          localStorage.setItem('arrival_panel_minimized', 'false')
        }
      }
      
      setPrevFreshCount(freshBookings.length)

      // Keep current index in bounds
      if (currentIndex >= bookings.length && bookings.length > 0) {
        setCurrentIndex(bookings.length - 1)
      }
    } catch (e: any) {
      console.error('Error fetching due bookings:', e)
      setError('Failed to fetch due appointments.')
    }
  }

  // Load and setup polling every 30 seconds
  useEffect(() => {
    fetchDueBookings()
    const interval = setInterval(() => {
      fetchDueBookings()
    }, 30000)
    return () => clearInterval(interval)
  }, [businessId, prevFreshCount, hasInitialized])

  const handleOutcome = async (bookingId: string, outcome: 'completed' | 'no_show') => {
    setError(null)
    try {
      await updateBookingStatus(businessId, bookingId, outcome)
      // Remove from local list immediately to feel responsive
      const updated = dueBookings.filter(b => b.id !== bookingId)
      setDueBookings(updated)
      
      // Update fresh count for remaining items
      const STALE_THRESHOLD_MINUTES = 60
      const now = new Date()
      const thresholdTime = new Date(now.getTime() - STALE_THRESHOLD_MINUTES * 60 * 1000)
      const freshBookings = updated.filter(b => new Date(b.start_time) >= thresholdTime)
      setPrevFreshCount(freshBookings.length)
      
      if (currentIndex >= updated.length && updated.length > 0) {
        setCurrentIndex(updated.length - 1)
      }
    } catch (e: any) {
      console.error('Failed to save booking outcome:', e)
      setError('Could not update status. Please try again.')
    }
  }

  const handleMinimize = (min: boolean) => {
    setIsMinimized(min)
    localStorage.setItem('arrival_panel_minimized', String(min))
  }

  if (dueBookings.length === 0) return null

  const activeBooking = dueBookings[currentIndex]
  if (!activeBooking) return null

  // Format local time helper
  const formatLocalTime = (isoString: string): string => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Format price
  const formatPrice = (cents: number): string => {
    return `R ${(cents / 100).toFixed(2)}`
  }

  // WhatsApp click-to-chat link
  const whatsappLink = activeBooking.customer?.phone
    ? createWhatsAppLink(
        activeBooking.customer.phone,
        getTodayReminderMessage(
          activeBooking.customer.full_name,
          activeBooking.pet?.name || 'your dog',
          formatLocalTime(activeBooking.start_time)
        )
      )
    : null

  const openBookingOnList = () => {
    const searchVal = activeBooking.customer?.phone || activeBooking.customer?.full_name || ''
    navigate(`/admin/bookings?search=${encodeURIComponent(searchVal)}`)
  }

  // MINIMIZED STATE PILL
  if (isMinimized) {
    return (
      <div 
        onClick={() => handleMinimize(false)}
        className="fixed bottom-6 right-6 z-50 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs px-4 py-3 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:shadow-md transition-all duration-150 cursor-pointer flex items-center space-x-2 border border-indigo-500 animate-bounce"
        style={{ animationDuration: '3s' }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></div>
        <span>
          {dueBookings.length} {dueBookings.length === 1 ? 'appointment needs outcome' : 'appointments need outcome'}
        </span>
      </div>
    )
  }

  // EXPANDED STATE PANEL
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[350px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border-2 border-indigo-100 overflow-hidden animate-slideUp font-sans">
      {/* Header */}
      <div className="bg-indigo-600 text-white p-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-white animate-pulse" />
          <span className="font-extrabold text-xs uppercase tracking-wider">
            Appointment due now
          </span>
        </div>
        <button 
          onClick={() => handleMinimize(true)}
          className="text-indigo-100 hover:text-white p-1 hover:bg-indigo-700/50 rounded-lg transition-colors cursor-pointer"
          title="Minimize"
        >
          <Minus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-4 space-y-3.5">
        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-750 text-xs font-semibold rounded-xl flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-650" />
            <span>{error}</span>
          </div>
        )}

        {/* Carousel indicator if multiple */}
        {dueBookings.length > 1 && (
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-slate-100 pb-2">
            <span>Queue outcome: {currentIndex + 1} of {dueBookings.length}</span>
            <div className="flex items-center space-x-1">
              <button 
                onClick={() => setCurrentIndex(prev => (prev > 0 ? prev - 1 : dueBookings.length - 1))}
                className="p-1 hover:bg-slate-100 text-slate-500 rounded-md transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setCurrentIndex(prev => (prev < dueBookings.length - 1 ? prev + 1 : 0))}
                className="p-1 hover:bg-slate-100 text-slate-500 rounded-md transition-all cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Appointment Card Details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-[11px] font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{formatLocalTime(activeBooking.start_time)}</span>
            </div>
            <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
              {activeBooking.service?.duration_minutes} mins
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              <Dog className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm leading-tight capitalize">
                  {activeBooking.pet?.name}
                </h4>
                <p className="text-[11px] text-slate-700 font-semibold mt-0.5 capitalize">
                  {activeBooking.pet?.size} Dog 
                  {activeBooking.pet?.breed ? ` • ${activeBooking.pet.breed}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 pt-0.5">
              <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-slate-805 text-xs text-slate-800">
                  {activeBooking.customer?.full_name} {activeBooking.customer?.surname || ''}
                </p>
                <p className="text-[10px] text-slate-700 font-semibold">{activeBooking.customer?.phone}</p>
              </div>
            </div>

            <div className="flex items-start space-x-2 pt-0.5">
              <Scissors className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-indigo-650 text-xs">
                  {activeBooking.service?.name}
                </p>
                <p className="text-[10px] text-slate-700 font-bold mt-0.5">
                  Cost: {activeBooking.service ? formatPrice(activeBooking.service.price_cents) : ''}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Contact Action */}
        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 text-xs font-bold rounded-xl border border-emerald-250/60 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <MessageCircle className="w-4.5 h-4.5 fill-emerald-150 shrink-0" />
            <span>WhatsApp Client</span>
          </a>
        )}

        {/* Outcome & Details Button Panel */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleOutcome(activeBooking.id, 'completed')}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-extrabold rounded-xl flex items-center justify-center space-x-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Arrived</span>
            </button>
            <button
              onClick={() => handleOutcome(activeBooking.id, 'no_show')}
              className="flex-1 py-2.5 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-red-650 hover:text-red-750 text-xs font-extrabold rounded-xl flex items-center justify-center space-x-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20"
            >
              <X className="w-3.5 h-3.5" />
              <span>No-show</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={openBookingOnList}
              className="w-full py-2 border border-slate-250 hover:bg-slate-50 text-slate-650 text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open booking</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
