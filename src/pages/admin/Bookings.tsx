import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Calendar,
  Search,
  Check,
  X,
  CheckCircle,
  AlertTriangle,
  UserX,
  MessageCircle,
  FileText,
  ChevronLeft,
  RefreshCw,
  Clock,
  Dog,
  User,
  Phone,
  Mail,
  Edit3
} from 'lucide-react'
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  EmptyState,
  LoadingState,
  AlertMessage
} from '../../components/UI'
import {
  fetchAdminBookings,
  updateBookingStatus,
  updateBookingAdminNotes,
  type Booking
} from '../../services/bookingAdminService'

// Helper to format ISO string to readable local date/time
const formatDateTime = (isoString: string): string => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Helper to format price from cents to Rands
const formatPrice = (cents: number): string => {
  return `R ${(cents / 100).toFixed(2)}`
}

// Helper to get status badge props
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

// WhatsApp link generator
const getWhatsAppLink = (phone: string, customerName: string, serviceName: string, startTime: string) => {
  let cleanPhone = phone.replace(/\D/g, '')
  if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
    cleanPhone = '27' + cleanPhone.slice(1)
  }
  const formattedDate = formatDateTime(startTime)
  const text = encodeURIComponent(
    `Hello ${customerName}, this is Dog Parlour. We are writing regarding your booking request for ${serviceName} on ${formattedDate}.`
  )
  return `https://wa.me/${cleanPhone}?text=${text}`
}

export default function Bookings() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()

  // State
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Cancel Confirmation Modal State
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)

  // Notes editing state
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [tempNotesValue, setTempNotesValue] = useState<string>('')

  // Fetch bookings data
  const loadBookings = async (businessId: string) => {
    try {
      setLoading(true)
      const data = await fetchAdminBookings(businessId)
      setBookings(data)
    } catch (err: any) {
      console.error('Error fetching bookings:', err)
      setError(err.message || 'Failed to load bookings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return

    if (!profile || !profile.business_id) {
      setError('You are not associated with a business profile.')
      setLoading(false)
      return
    }

    loadBookings(profile.business_id)
  }, [profile, authLoading])

  // Handle status update actions
  const handleStatusChange = async (bookingId: string, newStatus: Booking['status']) => {
    if (!profile?.business_id) return
    setError(null)
    setSuccess(null)
    setActionLoading(bookingId)

    try {
      await updateBookingStatus(profile.business_id, bookingId, newStatus)
      setSuccess(`Booking status successfully updated to ${newStatus}.`)
      
      // Update local state without full reload
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
      )
    } catch (err: any) {
      console.error('Error updating status:', err)
      setError(err.message || `Failed to update status to ${newStatus}.`)
    } finally {
      setActionLoading(null)
      setConfirmCancelId(null)
    }
  }

  // Handle note updates
  const startEditingNotes = (booking: Booking) => {
    setEditingNotesId(booking.id)
    setTempNotesValue(booking.admin_notes || '')
  }

  const handleNotesSave = async (bookingId: string) => {
    if (!profile?.business_id) return
    setError(null)
    setSuccess(null)
    setActionLoading(bookingId)

    try {
      const trimmedNotes = tempNotesValue.trim() || null
      await updateBookingAdminNotes(profile.business_id, bookingId, trimmedNotes)
      setSuccess('Admin notes updated successfully.')

      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, admin_notes: trimmedNotes } : b))
      )
      setEditingNotesId(null)
    } catch (err: any) {
      console.error('Error saving notes:', err)
      setError(err.message || 'Failed to save admin notes.')
    } finally {
      setActionLoading(null)
    }
  }

  // Filter and search logic
  const filteredBookings = bookings.filter((booking) => {
    // 1. Status Filter
    if (statusFilter !== 'all' && booking.status !== statusFilter) {
      return false
    }

    // 2. Date Filter (matches YYYY-MM-DD local format)
    if (dateFilter) {
      const bDate = new Date(booking.start_time)
      const offset = bDate.getTimezoneOffset()
      const localDate = new Date(bDate.getTime() - offset * 60 * 1000)
      const localDateStr = localDate.toISOString().split('T')[0]
      if (localDateStr !== dateFilter) {
        return false
      }
    }

    // 3. Search query: Owner Name, Owner Phone, Pet Name
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      const ownerName = booking.customer?.full_name?.toLowerCase() || ''
      const ownerPhone = booking.customer?.phone?.toLowerCase() || ''
      const petName = booking.pet?.name?.toLowerCase() || ''
      
      if (!ownerName.includes(query) && !ownerPhone.includes(query) && !petName.includes(query)) {
        return false
      }
    }

    return true
  })

  // Count filters
  const getCountByStatus = (status: string) => {
    if (status === 'all') return bookings.length
    return bookings.filter((b) => b.status === status).length
  }

  if (loading && bookings.length === 0) {
    return <LoadingState message="Loading bookings list..." />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Appointed Bookings"
        description="Review booking requests, track services, update status workflows, and communicate with clients."
        action={
          <div className="flex items-center space-x-2">
            <button
              onClick={() => profile?.business_id && loadBookings(profile.business_id)}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              title="Refresh bookings data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/admin/schedule')}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 flex items-center space-x-1.5"
            >
              <Calendar className="w-4 h-4" />
              <span>Calendar View</span>
            </button>
            <button
              onClick={() => navigate('/admin')}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 flex items-center space-x-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
          </div>
        }
      />

      {/* State Feedback Alerts */}
      {error && <AlertMessage type="error" message={error} />}
      {success && <AlertMessage type="success" message={success} />}

      {/* Control bar: Search & Date Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative md:col-span-2">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search by owner name, phone number, or pet name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Date Filter */}
        <div className="flex space-x-2">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="px-3 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Quick Filters Grid (Status badges) */}
      <div className="flex items-center space-x-2 flex-wrap gap-y-2 border-b border-slate-100 pb-4">
        {[
          { key: 'all', label: 'All Bookings', color: 'bg-slate-100 text-slate-700 border-slate-200' },
          { key: 'pending', label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { key: 'confirmed', label: 'Confirmed', color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { key: 'completed', label: 'Completed', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { key: 'cancelled', label: 'Cancelled', color: 'bg-red-50 text-red-700 border-red-200' },
          { key: 'no_show', label: 'No Show', color: 'bg-slate-100 text-slate-600 border-slate-200' }
        ].map((btn) => {
          const isActive = statusFilter === btn.key
          return (
            <button
              key={btn.key}
              onClick={() => setStatusFilter(btn.key)}
              className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                isActive
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              <span>{btn.label}</span>
              <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                isActive 
                  ? 'bg-indigo-700 text-white' 
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {getCountByStatus(btn.key)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Main Bookings List Container */}
      <div className="space-y-6">
        {filteredBookings.length === 0 ? (
          <SectionCard>
            <EmptyState
              title="No Bookings Match Criteria"
              description="Adjust your search terms, date filter, or click on a different booking status tab."
              icon={<Calendar className="w-12 h-12 text-slate-300" />}
            />
          </SectionCard>
        ) : (
          filteredBookings.map((booking) => (
            <SectionCard
              key={booking.id}
              className="overflow-hidden hover:shadow-xs transition-shadow border-slate-200"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                {/* 1. Date & Service Overview */}
                <div className="space-y-4 lg:max-w-md w-full">
                  <div className="flex items-center space-x-2.5">
                    {(() => {
                      const badgeProps = getStatusBadgeProps(booking.status)
                      return <StatusBadge status={badgeProps.status} label={badgeProps.label} />
                    })()}
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      ID: {booking.id.slice(0, 8)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start space-x-2">
                      <Clock className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                          {formatDateTime(booking.start_time)}
                        </h3>
                        <p className="text-xs font-semibold text-slate-400 mt-0.5">
                          Duration: {booking.service?.duration_minutes || 0} minutes
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-2 pt-1">
                      <FileText className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                      <div>
                        <p className="font-extrabold text-indigo-600 text-sm">
                          {booking.service?.name || 'Unknown Treatment'}
                        </p>
                        <p className="text-xs font-bold text-slate-500 mt-0.5">
                          Cost: {booking.service ? formatPrice(booking.service.price_cents) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Customer & Pet details (GroomWise Context) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow">
                  {/* Owner */}
                  <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 space-y-2.5">
                    <div className="flex items-center space-x-2 border-b border-slate-200/50 pb-1.5">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Client Information
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-bold text-slate-800 text-sm">
                        {booking.customer?.full_name || 'Anonymous Customer'}
                      </p>
                      <div className="flex items-center space-x-1.5 text-slate-600 font-semibold">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{booking.customer?.phone}</span>
                      </div>
                      {booking.customer?.email && (
                        <div className="flex items-center space-x-1.5 text-slate-600 font-semibold truncate">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{booking.customer.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pet details */}
                  <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 space-y-2.5">
                    <div className="flex items-center space-x-2 border-b border-slate-200/50 pb-1.5">
                      <Dog className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Pet Details
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-bold text-slate-800 text-sm">
                        {booking.pet?.name || 'Unnamed Pet'}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {booking.pet?.size && (
                          <span className="px-2 py-0.5 bg-slate-200/60 text-slate-700 text-[10px] font-extrabold rounded-full uppercase">
                            {booking.pet.size}
                          </span>
                        )}
                        {booking.pet?.breed && (
                          <span className="px-2 py-0.5 bg-slate-200/60 text-slate-700 text-[10px] font-extrabold rounded-full">
                            {booking.pet.breed}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Notes & Status Action workflows */}
                <div className="flex flex-col justify-between w-full lg:w-48 space-y-3 shrink-0">
                  <div className="space-y-2">
                    {/* WhatsApp Action button */}
                    {booking.customer?.phone && (
                      <a
                        href={getWhatsAppLink(
                          booking.customer.phone,
                          booking.customer.full_name,
                          booking.service?.name || '',
                          booking.start_time
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <MessageCircle className="w-3.5 h-3.5 fill-emerald-100 group-hover:fill-emerald-200" />
                        <span>WhatsApp Client</span>
                      </a>
                    )}

                    {/* Booking Status transition logic */}
                    <div className="space-y-1.5">
                      {booking.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(booking.id, 'confirmed')}
                            disabled={actionLoading === booking.id}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Confirm Request</span>
                          </button>
                          <button
                            onClick={() => setConfirmCancelId(booking.id)}
                            disabled={actionLoading === booking.id}
                            className="w-full py-2 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancel Booking</span>
                          </button>
                        </>
                      )}

                      {booking.status === 'confirmed' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(booking.id, 'completed')}
                            disabled={actionLoading === booking.id}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Mark Completed</span>
                          </button>
                          <button
                            onClick={() => handleStatusChange(booking.id, 'no_show')}
                            disabled={actionLoading === booking.id}
                            className="w-full py-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 hover:text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Mark No Show</span>
                          </button>
                          <button
                            onClick={() => setConfirmCancelId(booking.id)}
                            disabled={actionLoading === booking.id}
                            className="w-full py-2 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancel Appointment</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Notes Footer Segment (Grooming details) */}
              <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed font-medium">
                {/* Customer Notes */}
                <div className="space-y-1.5">
                  <span className="font-extrabold text-slate-400 uppercase tracking-wider block">
                    Customer Requests & Notes
                  </span>
                  <p className="text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100 min-h-[50px] italic">
                    {booking.customer_notes || 'No instructions provided by the customer.'}
                  </p>
                </div>

                {/* Admin Notes Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-400 uppercase tracking-wider">
                      Internal Admin Notes
                    </span>
                    {editingNotesId !== booking.id && (
                      <button
                        onClick={() => startEditingNotes(booking)}
                        className="text-indigo-600 hover:text-indigo-700 font-bold transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Notes</span>
                      </button>
                    )}
                  </div>

                  {editingNotesId === booking.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={tempNotesValue}
                        onChange={(e) => setTempNotesValue(e.target.value)}
                        placeholder="Add notes about groom temperament, blade sizes, specific requests..."
                        rows={2}
                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-xs bg-white"
                      />
                      <div className="flex items-center space-x-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingNotesId(null)}
                          className="px-2.5 py-1 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNotesSave(booking.id)}
                          disabled={actionLoading === booking.id}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg shadow-xs transition-all flex items-center space-x-1"
                        >
                          {actionLoading === booking.id ? 'Saving...' : 'Save Notes'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100 min-h-[50px]">
                      {booking.admin_notes || 'No internal grooming notes added yet.'}
                    </p>
                  )}
                </div>
              </div>
            </SectionCard>
          ))
        )}
      </div>

      {/* Confirmation modal for Cancellation */}
      {confirmCancelId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Cancel Appointment?</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-6 font-medium">
                Are you sure you want to cancel this booking? This slot will immediately open on the calendar for other customer requests.
              </p>
              <div className="flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setConfirmCancelId(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(confirmCancelId, 'cancelled')}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20"
                >
                  Yes, Cancel Booking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
