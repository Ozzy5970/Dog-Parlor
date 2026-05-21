import { useLocation, Link } from 'react-router-dom'
import { CheckCircle2, MessageSquare, ArrowLeft, Tag, Calendar, Clock, PawPrint, User } from 'lucide-react'

interface BookingDetails {
  serviceName: string
  start_time: string
  dateStr: string
  timeStr: string
  customerName: string
  petName: string
  whatsappNumber: string | null
}

export default function BookingSuccess() {
  const location = useLocation()
  const bookingDetails = location.state?.bookingDetails as BookingDetails | undefined

  // Helper to format date cleanly
  const formatDateFriendly = (dateStr: string) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-').map(Number)
    const d = new Date(Date.UTC(year, month - 1, day))
    return d.toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
  }

  // Helper to construct WhatsApp messaging URL
  const getWhatsAppUrl = (details: BookingDetails) => {
    if (!details.whatsappNumber) return '#'
    let cleaned = details.whatsappNumber.replace(/\D/g, '')
    // Default to South Africa (+27) if starts with 0 and is 10 digits
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      cleaned = '27' + cleaned.substring(1)
    }
    const friendlyDate = formatDateFriendly(details.dateStr)
    const message = `Hi! I just submitted a booking request for my pet, ${details.petName}, for a ${details.serviceName} on ${friendlyDate} at ${details.timeStr}. My name is ${details.customerName}. Please confirm if this slot is available. Thank you!`
    return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`
  }

  return (
    <div className="max-w-md mx-auto py-8 text-center flex flex-col items-center">
      {/* Premium Checkmark Badge */}
      <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-xs border border-emerald-150/60">
        <CheckCircle2 className="w-10 h-10 stroke-[2.2]" />
      </div>

      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3 font-sans">
        Request Submitted!
      </h1>
      
      <p className="text-slate-600 text-sm leading-relaxed mb-8 max-w-sm font-sans font-medium">
        Your booking request has been received. The parlour will review your details and confirm the appointment shortly.
      </p>

      {bookingDetails ? (
        <div className="w-full bg-slate-50/50 border border-slate-200/80 rounded-2xl p-6 text-left mb-8 shadow-xs space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-sans border-b border-slate-250 pb-2">
            Booking Summary
          </h2>
          
          <div className="space-y-3 font-sans text-sm">
            <div className="flex justify-between items-start">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-slate-400" /> Service
              </span>
              <span className="font-bold text-slate-800 text-right">{bookingDetails.serviceName}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" /> Date
              </span>
              <span className="font-bold text-slate-800 text-right">{formatDateFriendly(bookingDetails.dateStr)}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" /> Requested Time
              </span>
              <span className="font-extrabold text-indigo-600 text-right">{bookingDetails.timeStr}</span>
            </div>
            <div className="flex justify-between items-start border-t border-slate-200/60 pt-3">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <PawPrint className="w-4 h-4 text-slate-400" /> Pet Name
              </span>
              <span className="font-bold text-slate-800">{bookingDetails.petName}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" /> Owner Name
              </span>
              <span className="font-bold text-slate-800">{bookingDetails.customerName}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full p-4 bg-amber-50/60 border border-amber-200/80 text-amber-800 rounded-xl text-xs font-semibold text-left mb-8 leading-normal font-sans">
          Note: Reloading this page hides the temporary receipt details. Rest assured, your request is safely saved in our system!
        </div>
      )}

      <div className="flex flex-col gap-3 w-full">
        {bookingDetails?.whatsappNumber && (
          <a
            href={getWhatsAppUrl(bookingDetails)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm hover:shadow-md gap-2 cursor-pointer duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <MessageSquare className="w-4.5 h-4.5 fill-current" />
            <span>Send WhatsApp Confirmation</span>
          </a>
        )}

        <Link
          to="/"
          className="w-full inline-flex items-center justify-center px-6 py-3.5 border border-slate-200 hover:bg-slate-50 hover:border-slate-350 text-slate-700 text-sm font-bold rounded-xl transition-all shadow-xs duration-150 cursor-pointer gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
      </div>
    </div>
  )
}

