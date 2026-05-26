import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
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
  RefreshCw,
  Clock,
  Dog,
  User,
  Phone,
  Mail,
  Edit3,
  Plus,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Bell
} from 'lucide-react'
import { createWhatsAppLink, getPendingBookingMessage, getConfirmedBookingMessage, getCancelledBookingMessage, getTodayReminderMessage } from '../../lib/whatsapp'
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
  resolveBookingPet,
  createPetAndAssignToBooking,
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

// Helper to format date and time parts separately for WhatsApp messages
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

const formatFilterDate = (dateStr: string): string => {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

const sourceLabels: Record<string, string> = {
  online: 'Online',
  phone: 'Phone',
  walk_in: 'Walk-in',
  admin: 'Other manual'
}

// Helper to synthesize a beautiful soft chime sound via Web Audio API
const playChimeSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    // First note (E5, high-pitched, soft)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(659.25, now) // E5
    gain1.gain.setValueAtTime(0.08, now) // Low volume for softness
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.35)

    // Second note (A5, harmonizing, slightly delayed)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880.00, now + 0.12) // A5
    gain2.gain.setValueAtTime(0.08, now + 0.12)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.12)
    osc2.stop(now + 0.6)
  } catch (e) {
    console.warn('Audio play failed silently:', e)
  }
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
  const [businessName, setBusinessName] = useState('the Parlour')

  // Sound Notification state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('admin_booking_sound_enabled')
    return stored !== null ? stored === 'true' : true
  })
  const [showNewBookingToast, setShowNewBookingToast] = useState(false)
  const [newBookingDetails, setNewBookingDetails] = useState<{ petName: string; customerName: string } | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  
  const seenPendingIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (profile?.business_id) {
      supabase
        .from('businesses')
        .select('name')
        .eq('id', profile.business_id)
        .single()
        .then(({ data }) => {
          if (data?.name) {
            setBusinessName(data.name)
          }
        })
    }
  }, [profile])

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'all' | 'awaiting' | 'upcoming' | 'history'>('all')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Cancel Confirmation Modal State
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)

  // Notes editing state
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [tempNotesValue, setTempNotesValue] = useState<string>('')

  // Active pets cache state
  const [activePets, setActivePets] = useState<any[]>([])

  // Pet Resolution Modal State
  const [resolvingBooking, setResolvingBooking] = useState<Booking | null>(null)
  const [resolveActionLoading, setResolveActionLoading] = useState(false)
  const [showNewPetForm, setShowNewPetForm] = useState(false)

  // New pet inputs (for create_pet_for_booking_and_assign)
  const [newPetName, setNewPetName] = useState('')
  const [newPetSpecies, setNewPetSpecies] = useState('dog')
  const [newPetBreed, setNewPetBreed] = useState('')
  const [newPetSize, setNewPetSize] = useState('')
  const [newPetAge, setNewPetAge] = useState('')
  const [newPetNotes, setNewPetNotes] = useState('')

  // Ambiguity detection helpers
  const getMatchingActivePets = (booking: Booking) => {
    if (!booking.pet?.name) return []
    const bPetName = booking.pet.name.trim().toLowerCase()
    const householdId = booking.customer?.household_id
    const customerId = booking.customer_id

    return activePets.filter(p => {
      const nameMatches = p.name.trim().toLowerCase() === bPetName
      if (!nameMatches) return false

      if (householdId && p.household_id === householdId) return true
      if (p.customer_id === customerId) return true
      return false
    })
  }

  const getHouseholdActivePets = (booking: Booking) => {
    const householdId = booking.customer?.household_id
    const customerId = booking.customer_id

    return activePets.filter(p => {
      if (householdId && p.household_id === householdId) return true
      if (p.customer_id === customerId) return true
      return false
    })
  }

  // Fetch bookings data
  const loadBookings = async (businessId: string, silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await fetchAdminBookings(businessId)
      setBookings(data)

      // Fetch active pets for all households/customers represented
      const householdIds = data.map(b => b.customer?.household_id).filter(Boolean) as string[]
      const customerIds = data.map(b => b.customer_id).filter(Boolean) as string[]

      if (householdIds.length > 0 || customerIds.length > 0) {
        let query = supabase.from('pets').select('*').eq('is_active', true)
        
        const orConditions: string[] = []
        if (householdIds.length > 0) {
          orConditions.push(`household_id.in.(${householdIds.join(',')})`)
        }
        if (customerIds.length > 0) {
          orConditions.push(`customer_id.in.(${customerIds.join(',')})`)
        }
        
        const { data: petsData, error: petsError } = await query.or(orConditions.join(','))
        if (!petsError && petsData) {
          setActivePets(petsData)
        }
      } else {
        setActivePets([])
      }



    } catch (err: any) {
      console.error('Error fetching bookings:', err)
      setError(err.message || 'Failed to load bookings.')
    } finally {
      setLoading(false)
    }
  }

  // Submit existing pet selection
  const handleSelectExistingPet = async (petId: string) => {
    if (!resolvingBooking) return
    setResolveActionLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await resolveBookingPet(resolvingBooking.id, petId)
      setSuccess("Pet assignment resolved successfully.")
      
      // Update local booking state with the new pet details
      const selectedPet = activePets.find(p => p.id === petId)
      setBookings(prev => prev.map(b => {
        if (b.id === resolvingBooking.id) {
          return {
            ...b,
            pet_id: petId,
            pet: selectedPet ? {
              id: selectedPet.id,
              name: selectedPet.name,
              breed: selectedPet.breed,
              size: selectedPet.size,
              age_years: selectedPet.age_years,
              species: selectedPet.species,
              household_id: selectedPet.household_id
            } : b.pet
          }
        }
        return b
      }))
      setResolvingBooking(null)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Failed to resolve pet assignment.")
    } finally {
      setResolveActionLoading(false)
    }
  }

  // Submit new pet creation
  const handleCreateAndAssignPet = async () => {
    if (!resolvingBooking) return
    const trimmedName = newPetName.trim()
    if (!trimmedName) {
      setError("Pet name is required.")
      return
    }

    setResolveActionLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const ageNum = newPetAge ? parseFloat(newPetAge) : null
      await createPetAndAssignToBooking(resolvingBooking.id, {
        name: trimmedName,
        species: newPetSpecies,
        breed: newPetBreed.trim() || null,
        size: newPetSize || null,
        age_years: ageNum,
        notes: newPetNotes.trim() || null
      })

      setSuccess("New pet profile created and assigned successfully.")

      // Refresh bookings and active pets list so we have the updated records
      if (profile?.business_id) {
        await loadBookings(profile.business_id)
      }
      setResolvingBooking(null)
      setNewPetName('')
      setNewPetSpecies('dog')
      setNewPetBreed('')
      setNewPetSize('')
      setNewPetAge('')
      setNewPetNotes('')
      setShowNewPetForm(false)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Failed to create new pet profile.")
    } finally {
      setResolveActionLoading(false)
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

  // Toggle sound handler
  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled)
    localStorage.setItem('admin_booking_sound_enabled', String(enabled))
    if (enabled) {
      playChimeSound()
    }
  }

  // Polling for bookings every 30 seconds (silent refresh)
  useEffect(() => {
    if (authLoading || !profile?.business_id) return

    const interval = setInterval(() => {
      loadBookings(profile.business_id, true)
    }, 30000)

    return () => clearInterval(interval)
  }, [profile, authLoading])

  // Detect new pending online bookings to trigger alerts
  useEffect(() => {
    if (bookings.length === 0) return

    const pendingOnlineBookings = bookings.filter(b => b.status === 'pending' && b.source === 'online')
    const pendingOnlineIds = pendingOnlineBookings.map(b => b.id)

    if (isInitialLoad) {
      seenPendingIdsRef.current = new Set(pendingOnlineIds)
      setIsInitialLoad(false)
      return
    }

    const newPending = pendingOnlineBookings.filter(b => !seenPendingIdsRef.current.has(b.id))

    if (newPending.length > 0) {
      newPending.forEach(b => seenPendingIdsRef.current.add(b.id))

      const latest = newPending[newPending.length - 1]
      setNewBookingDetails({
        petName: latest.pet?.name || 'Unnamed Pet',
        customerName: latest.customer?.full_name || 'Anonymous'
      })
      setShowNewBookingToast(true)

      if (soundEnabled) {
        playChimeSound()
      }
    }
  }, [bookings, isInitialLoad, soundEnabled])

  // Handle status update actions
  const handleStatusChange = async (bookingId: string, newStatus: Booking['status']) => {
    if (!profile?.business_id) return
    setError(null)
    setSuccess(null)

    // Guard: Prevent confirming if ambiguous
    if (newStatus === 'confirmed') {
      const booking = bookings.find(b => b.id === bookingId)
      if (booking && booking.status === 'pending') {
        const matchingPets = getMatchingActivePets(booking)
        if (matchingPets.length > 1) {
          setError("Please confirm which pet this booking is for before approving.")
          setResolvingBooking(booking)
          setShowNewPetForm(false)
          return
        }
      }
    }

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
      if (err.message === 'CONCURRENCY_ERROR') {
        setError('This booking was already updated. Refreshing...')
        await loadBookings(profile.business_id, true)
      } else {
        setError(err.message || `Failed to update status to ${newStatus}.`)
      }
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

  // Filter and search logic - base list without status filter for group counts
  const baseFilteredBookings = bookings.filter((booking) => {
    // 1. Date Filter (matches YYYY-MM-DD local format)
    if (dateFilter) {
      const bDate = new Date(booking.start_time)
      const offset = bDate.getTimezoneOffset()
      const localDate = new Date(bDate.getTime() - offset * 60 * 1000)
      const localDateStr = localDate.toISOString().split('T')[0]
      if (localDateStr !== dateFilter) {
        return false
      }
    }

    // 2. Search query: Owner Name, Owner Phone, Pet Name
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

  // Full filtered bookings (with status filter applied)
  const filteredBookings = baseFilteredBookings.filter((booking) => {
    if (statusFilter !== 'all' && booking.status !== statusFilter) {
      return false
    }
    return true
  })

  // Count filters
  const getCountByStatus = (status: string) => {
    if (status === 'all') return bookings.length
    return bookings.filter((b) => b.status === status).length
  }

  // Expanded history tracking state
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({})

  const toggleHistoryExpand = (id: string) => {
    setExpandedHistoryIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Sorting & Grouping by Operational Priority
  const nowTime = new Date().getTime()

  // Group A: Awaiting Confirmation (pending, sorted by created_at ascending, else start_time ascending)
  const awaitingBookings = baseFilteredBookings
    .filter((b) => b.status === 'pending')
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : new Date(a.start_time).getTime()
      const bTime = b.created_at ? new Date(b.created_at).getTime() : new Date(b.start_time).getTime()
      return aTime - bTime
    })

  // Group B: Upcoming Confirmed (confirmed, start_time >= now, sorted by start_time ascending)
  const upcomingBookings = baseFilteredBookings
    .filter((b) => b.status === 'confirmed' && new Date(b.start_time).getTime() >= nowTime)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  // Group C: History / Past & Closed (completed, cancelled, no_show, and confirmed with start_time < now, sorted by start_time descending)
  const historyBookings = baseFilteredBookings
    .filter((b) =>
      b.status === 'completed' ||
      b.status === 'cancelled' ||
      b.status === 'no_show' ||
      (b.status === 'confirmed' && new Date(b.start_time).getTime() < nowTime)
    )
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())

  // Displayed subsets (after applying statusFilter)
  const displayedAwaiting = awaitingBookings.filter((b) => statusFilter === 'all' || b.status === statusFilter)
  const displayedUpcoming = upcomingBookings.filter((b) => statusFilter === 'all' || b.status === statusFilter)
  const displayedHistory = historyBookings.filter((b) => statusFilter === 'all' || b.status === statusFilter)

  // Helper to render booking details inside the card
  const renderBookingCard = (booking: Booking, isHistoryView: boolean = false) => {
    const isExpanded = !isHistoryView || !!expandedHistoryIds[booking.id]
    const badgeProps = getStatusBadgeProps(booking.status)
    const matchingActivePets = getMatchingActivePets(booking)
    const isAmbiguous = booking.status === 'pending' && matchingActivePets.length > 1

    if (isHistoryView && !isExpanded) {
      // Collapsed History summary card
      return (
        <SectionCard
          key={booking.id}
          className="overflow-hidden hover:shadow-xs transition-shadow border-slate-200 p-0 cursor-pointer"
        >
          <div
            onClick={() => toggleHistoryExpand(booking.id)}
            className="flex flex-wrap items-center justify-between p-4 hover:bg-slate-50/50 transition-colors select-none gap-3"
          >
            {/* Time & Date */}
            <div className="flex items-center space-x-2.5 min-w-[150px]">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-bold text-slate-800 text-sm">
                {formatLocalDatePart(booking.start_time)} at {formatLocalTimePart(booking.start_time)}
              </span>
            </div>

            {/* Pet Name */}
            <div className="flex items-center space-x-2 min-w-[120px]">
              <Dog className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-extrabold text-slate-900 text-sm">
                {booking.pet?.name || 'Unnamed Pet'}
              </span>
            </div>

            {/* Customer Name */}
            <div className="flex items-center space-x-2 min-w-[120px]">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-700 text-sm">
                {booking.customer?.full_name || 'Anonymous'}
              </span>
            </div>

            {/* Service Name */}
            <div className="flex items-center space-x-2 min-w-[140px] flex-1">
              <span className="font-bold text-indigo-600 text-sm truncate max-w-[180px]">
                {booking.service?.name || 'Grooming Treatment'}
              </span>
            </div>

            {/* Badges & Arrow */}
            <div className="flex items-center space-x-3 shrink-0">
              <StatusBadge status={badgeProps.status} label={badgeProps.label} />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                {sourceLabels[booking.source] || booking.source || 'Online'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </SectionCard>
      )
    }

    // Expanded standard card OR expanded history card
    return (
      <SectionCard
        key={booking.id}
        className={`overflow-hidden hover:shadow-xs transition-shadow border-slate-200 ${
          isHistoryView ? 'p-0 border-l-4 border-l-slate-400' : ''
        }`}
      >
        {isHistoryView && (
          /* Summary header clickable block to collapse it back */
          <div
            onClick={() => toggleHistoryExpand(booking.id)}
            className="flex flex-wrap items-center justify-between p-4 bg-slate-50/50 border-b border-slate-100 cursor-pointer hover:bg-slate-100/50 transition-colors select-none gap-3"
          >
            <div className="flex items-center space-x-2.5 min-w-[150px]">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-bold text-slate-800 text-sm">
                {formatLocalDatePart(booking.start_time)} at {formatLocalTimePart(booking.start_time)}
              </span>
            </div>
            <div className="flex items-center space-x-2 min-w-[120px]">
              <Dog className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-extrabold text-slate-900 text-sm">
                {booking.pet?.name || 'Unnamed Pet'}
              </span>
            </div>
            <div className="flex items-center space-x-2 min-w-[120px]">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-700 text-sm">
                {booking.customer?.full_name || 'Anonymous'}
              </span>
            </div>
            <div className="flex items-center space-x-2 min-w-[140px] flex-1">
              <span className="font-bold text-indigo-600 text-sm truncate max-w-[180px]">
                {booking.service?.name || 'Grooming Treatment'}
              </span>
            </div>
            <div className="flex items-center space-x-3 shrink-0">
              <StatusBadge status={badgeProps.status} label={badgeProps.label} />
              <ChevronUp className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        )}

        <div className={isHistoryView ? 'p-5' : ''}>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* 1. Date & Service Overview */}
            <div className="space-y-4 lg:max-w-md w-full">
              <div className="flex items-center space-x-2.5">
                {(() => {
                  const bProps = getStatusBadgeProps(booking.status)
                  return <StatusBadge status={bProps.status} label={bProps.label} />
                })()}
                {booking.customer && booking.created_at && (
                  (() => {
                    const custCreated = new Date(booking.customer.created_at).getTime()
                    const bookCreated = new Date(booking.created_at).getTime()
                    const isNew = Math.abs(custCreated - bookCreated) < 120 * 1000
                    if (isNew) {
                      return (
                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-250 text-emerald-800 text-[9px] font-black rounded-full uppercase tracking-wider">
                          New Customer
                        </span>
                      )
                    }
                    return null
                  })()
                )}
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                  {sourceLabels[booking.source] || booking.source || 'Online'}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l border-slate-200 pl-2.5">
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
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
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
                  {booking.customer?.household?.household_member_names && booking.customer.household.household_member_names.length > 0 && (
                    <div className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2 py-1 rounded-lg mt-1">
                      Household Members: {booking.customer.household.household_member_names.join(', ')}
                    </div>
                  )}


                </div>
              </div>

               {/* Pet details */}
              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 space-y-2.5">
                <div className="flex items-center space-x-2 border-b border-slate-200/50 pb-1.5">
                  <Dog className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Pet Details
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <p className="font-bold text-slate-800 text-sm">
                    {booking.pet?.name || 'Unnamed Pet'}
                  </p>
                  {isAmbiguous && (
                    <div className="flex items-center space-x-1.5 text-amber-600 bg-amber-50 border border-amber-250 px-2 py-1 rounded-lg text-[10px] font-bold mt-1.5 max-w-max animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Multiple possible pets found</span>
                    </div>
                  )}
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
                    {booking.pet?.age_years !== undefined && booking.pet?.age_years !== null && (
                      <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-150 text-indigo-700 text-[10px] font-extrabold rounded-full">
                        Age: {booking.pet.age_years} {booking.pet.age_years === 1 ? 'year' : 'years'}
                      </span>
                    )}
                  </div>
                  {(booking.status === 'pending' || booking.status === 'confirmed') && (
                    <button
                      type="button"
                      onClick={() => {
                        setResolvingBooking(booking)
                        setShowNewPetForm(false)
                      }}
                      className="text-[10px] font-bold text-indigo-650 hover:text-indigo-800 hover:underline mt-2 flex items-center space-x-1 cursor-pointer transition-colors border-none bg-transparent p-0"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Change Pet</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Notes & Status Action workflows */}
            <div className="flex flex-col justify-between w-full lg:w-48 space-y-3 shrink-0">
              <div className="space-y-2">
                {/* WhatsApp Action button */}
                {booking.customer?.phone && (() => {
                  const cName = booking.customer.full_name
                  const pName = booking.pet?.name || 'your dog'
                  const dateStr = formatLocalDatePart(booking.start_time)
                  const timeStr = formatLocalTimePart(booking.start_time)
                  
                  const isToday = new Date(booking.start_time).toDateString() === new Date().toDateString()
                  
                  let message = ''
                  if (booking.status === 'pending') {
                    message = getPendingBookingMessage(cName, businessName, pName, dateStr, timeStr)
                  } else if (booking.status === 'confirmed') {
                    if (isToday) {
                      message = getTodayReminderMessage(cName, pName, timeStr)
                    } else {
                      message = getConfirmedBookingMessage(cName, businessName, pName, dateStr, timeStr)
                    }
                  } else {
                    message = getCancelledBookingMessage(cName, businessName, pName, dateStr, timeStr)
                  }

                  const link = createWhatsAppLink(booking.customer.phone, message)
                  
                  return link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 fill-emerald-100 group-hover:fill-emerald-200" />
                      <span>
                        {booking.status === 'confirmed' && isToday ? 'WhatsApp Reminder' : 'WhatsApp Client'}
                      </span>
                    </a>
                  ) : null
                })()}

                {/* Booking Status transition logic */}
                <div className="space-y-1.5">
                  {booking.status === 'pending' && (
                    <>
                      {isAmbiguous ? (
                        <button
                          onClick={() => {
                            setResolvingBooking(booking)
                            setShowNewPetForm(false)
                          }}
                          disabled={actionLoading === booking.id}
                          className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Resolve Pet</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(booking.id, 'confirmed')}
                          disabled={actionLoading === booking.id}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Confirm Request</span>
                        </button>
                      )}
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
                        className="w-full py-2 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
              <span className="font-extrabold text-slate-700 uppercase tracking-wider block">
                Customer Requests & Notes
              </span>
              <p className="text-slate-650 bg-slate-50 rounded-xl p-3 border border-slate-100 min-h-[50px] italic">
                {booking.customer_notes || 'No instructions provided by the customer.'}
              </p>
            </div>

            {/* Admin Notes Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-700 uppercase tracking-wider">
                  Internal Admin Notes
                </span>
                {editingNotesId !== booking.id && (
                  <button
                    onClick={() => startEditingNotes(booking)}
                    className="text-indigo-600 hover:text-indigo-700 font-bold transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
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
                    className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-xs bg-white resize-none"
                  />
                  <div className="flex items-center space-x-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setEditingNotesId(null)}
                      className="px-2.5 py-1 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNotesSave(booking.id)}
                      disabled={actionLoading === booking.id}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg shadow-xs transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
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
        </div>
      </SectionCard>
    )
  }

  if (loading && bookings.length === 0) {
    return <LoadingState message="Loading bookings list..." />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Manage Bookings"
        description="Review booking requests, track services, update status workflows, and communicate with clients."
        action={
          <div className="flex items-center space-x-2 flex-wrap sm:flex-nowrap gap-2 justify-end">
            {/* Sound alert toggle control */}
            <button
              onClick={() => handleToggleSound(!soundEnabled)}
              className={`p-2 border rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 flex items-center space-x-1.5 text-xs font-bold ${
                soundEnabled
                  ? 'border-indigo-150 bg-indigo-55 text-indigo-700 hover:bg-indigo-100/50'
                  : 'border-slate-200 bg-white text-slate-450 hover:bg-slate-50 hover:text-slate-600'
              }`}
              title={soundEnabled ? "Disable sound alerts for new online requests" : "Enable sound alerts for new online requests"}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-4 h-4 shrink-0 text-indigo-600" />
                  <span className="hidden sm:inline">Sound alerts: On</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 shrink-0 text-slate-450" />
                  <span className="hidden sm:inline">Sound alerts: Off</span>
                </>
              )}
            </button>

            <button
              onClick={() => profile?.business_id && loadBookings(profile.business_id)}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-655 rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              title="Refresh bookings data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/admin/bookings/new')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 flex items-center space-x-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Booking</span>
            </button>
          </div>
        }
      />

      {/* State Feedback Alerts */}
      {error && <AlertMessage type="error" message={error} />}
      {success && <AlertMessage type="success" message={success} />}

      {/* Control bar: Search & Date Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end bg-slate-50/50 p-4 border border-slate-200/60 rounded-2xl">
        {/* Search */}
        <div className="md:col-span-2 space-y-1.5">
          <label htmlFor="search-input" className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">
            Search bookings
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              id="search-input"
              type="text"
              placeholder="Search by owner name, phone number, or pet name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-slate-400 hover:text-slate-650 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Date Filter */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label htmlFor="date-filter-input" className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Filter by appointment date
            </label>
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-[10px] font-bold text-indigo-650 hover:text-indigo-750 transition-colors cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
          <div className="relative flex w-full">
            {/* Display layer: styled to look exactly like the search input but hides native placeholder */}
            <div className="w-full px-4 py-2.5 border border-slate-200 rounded-xl font-medium text-sm bg-white flex items-center justify-between pointer-events-none select-none min-h-[42px]">
              <span className={dateFilter ? 'text-slate-800' : 'text-slate-400'}>
                {dateFilter ? formatFilterDate(dateFilter) : 'Choose appointment date'}
              </span>
              <Calendar className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
            </div>

            {/* The invisible native date input stacked on top */}
            <input
              id="date-filter-input"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Simple Group Filter Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2 pb-px">
        {[
          { key: 'all', label: 'All Bookings', count: baseFilteredBookings.length },
          { key: 'awaiting', label: 'Awaiting Confirmation', count: awaitingBookings.length },
          { key: 'upcoming', label: 'Upcoming Confirmed', count: upcomingBookings.length },
          { key: 'history', label: 'History / Past & Closed', count: historyBookings.length }
        ].map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key as any)
                if (tab.key === 'awaiting') {
                  setStatusFilter('all')
                } else if (tab.key === 'upcoming') {
                  setStatusFilter('all')
                } else if (tab.key === 'history' && statusFilter === 'pending') {
                  setStatusFilter('all')
                }
              }}
              className={`py-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center space-x-2 shrink-0 cursor-pointer focus:outline-none ${
                isActive
                  ? 'border-indigo-650 text-indigo-650'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-extrabold transition-all ${
                isActive 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Quick Filters Grid (Status badges) */}
      {(activeTab === 'all' || activeTab === 'history') && (
        <div className="flex items-center space-x-2 flex-wrap gap-y-2 border-b border-slate-100 pb-4">
          {[
            { key: 'all', label: 'All Statuses', color: 'bg-slate-100 text-slate-700 border-slate-200' },
            ...(activeTab === 'all' ? [{ key: 'pending', label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200' }] : []),
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
      )}

      {/* Main Bookings List Container */}
      <div className="space-y-8">
        {filteredBookings.length === 0 ? (
          <SectionCard>
            <EmptyState
              title="No Bookings Match Criteria"
              description="Adjust your search terms, date filter, or click on a different booking status tab."
              icon={<Calendar className="w-12 h-12 text-slate-300" />}
            />
          </SectionCard>
        ) : (
          <>
            {/* 1. Group A: Awaiting Confirmation */}
            {(activeTab === 'all' || activeTab === 'awaiting') && (statusFilter === 'all' || statusFilter === 'pending') && (
              <div className="space-y-4">
                <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  Awaiting Confirmation ({displayedAwaiting.length})
                </h2>
                {displayedAwaiting.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-center text-slate-450 font-bold text-xs">
                    No bookings waiting for confirmation.
                  </div>
                ) : (
                  displayedAwaiting.map((booking) => renderBookingCard(booking, false))
                )}
              </div>
            )}

            {/* 2. Group B: Upcoming Confirmed */}
            {(activeTab === 'all' || activeTab === 'upcoming') && (statusFilter === 'all' || statusFilter === 'confirmed') && (
              <div className="space-y-4 pt-2">
                <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-655 bg-indigo-600"></span>
                  Upcoming Confirmed ({displayedUpcoming.length})
                </h2>
                {displayedUpcoming.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-center text-slate-450 font-bold text-xs">
                    No confirmed upcoming bookings.
                  </div>
                ) : (
                  displayedUpcoming.map((booking) => renderBookingCard(booking, false))
                )}
              </div>
            )}

            {/* 3. Group C: History / Past & Closed */}
            {(activeTab === 'all' || activeTab === 'history') && (statusFilter === 'all' || ['completed', 'cancelled', 'no_show', 'confirmed'].includes(statusFilter)) && (
              <div className="space-y-4 pt-2">
                <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  History / Past & Closed ({displayedHistory.length})
                </h2>
                {displayedHistory.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-center text-slate-450 font-bold text-xs">
                    No past bookings yet.
                  </div>
                ) : (
                  displayedHistory.map((booking) => renderBookingCard(booking, true))
                )}
              </div>
            )}
          </>
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
      {/* Resolve Pet Modal */}
      {resolvingBooking && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <Dog className="w-5 h-5 text-indigo-650" />
                <span>Resolve Pet Identity</span>
              </h3>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Choose the correct pet profile for this booking or register a separate new pet.
              </p>
            </div>

            {/* Current Requested / Assigned Pet */}
            <div className="border border-indigo-100 bg-indigo-50/10 rounded-2xl p-4 space-y-2">
              <span className="text-[9px] font-black text-indigo-700 uppercase tracking-widest block">Currently Linked Pet</span>
              <div className="text-xs space-y-1">
                <p className="font-extrabold text-slate-800 text-sm">
                  {resolvingBooking.pet?.name || 'Unnamed Pet'}
                </p>
                <p className="text-slate-500 font-semibold">
                  Breed: {resolvingBooking.pet?.breed || 'Unknown'} • Size: {resolvingBooking.pet?.size || 'Unknown'}
                  {resolvingBooking.pet?.age_years !== null && ` • Age: ${resolvingBooking.pet?.age_years} years`}
                </p>
              </div>
            </div>

            {!showNewPetForm ? (
              <div className="space-y-4">
                {/* Alternative Active Pets in Household */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                    Active Household Pets
                  </span>
                  {(() => {
                    const householdPets = getHouseholdActivePets(resolvingBooking)
                    if (householdPets.length === 0) {
                      return (
                        <p className="text-xs text-slate-450 italic py-2">
                          No other active pets found in this household.
                        </p>
                      )
                    }
                    return (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {householdPets.map(pet => (
                          <div
                            key={pet.id}
                            className="border border-slate-200 hover:border-indigo-400 bg-slate-50/30 hover:bg-white p-3.5 rounded-xl flex items-center justify-between transition-all cursor-pointer group"
                            onClick={() => handleSelectExistingPet(pet.id)}
                          >
                            <div className="text-xs min-w-0">
                              <p className="font-bold text-slate-800 group-hover:text-indigo-650 transition-colors">
                                {pet.name}
                              </p>
                              <p className="text-slate-450 text-[10px] truncate mt-0.5">
                                Breed: {pet.breed || 'Unknown'} • Size: {pet.size || 'Unknown'}
                                {pet.age_years !== null && ` • Age: ${pet.age_years} yrs`}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="px-3 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-650 hover:text-indigo-700 font-bold rounded-lg text-[10px] transition-all cursor-pointer shadow-xs"
                            >
                              Use Pet
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setNewPetName(resolvingBooking.pet?.name || '')
                      setNewPetBreed(resolvingBooking.pet?.breed || '')
                      setNewPetSize(resolvingBooking.pet?.size || '')
                      setNewPetAge(resolvingBooking.pet?.age_years !== null && resolvingBooking.pet?.age_years !== undefined ? String(resolvingBooking.pet.age_years) : '')
                      setNewPetSpecies(resolvingBooking.pet?.species || 'dog')
                      setShowNewPetForm(true)
                    }}
                    className="px-4 py-2 border border-dashed border-indigo-250 hover:border-indigo-400 text-indigo-650 text-xs font-bold rounded-xl transition-all cursor-pointer bg-indigo-50/10 hover:bg-indigo-50/30"
                  >
                    + Create New Pet from Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolvingBooking(null)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Create New Pet Form */
              <div className="space-y-4 animate-fadeIn">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                  New Pet Profile Details
                </span>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 text-xs">
                    <label className="font-bold text-slate-700">Name *</label>
                    <input
                      type="text"
                      value={newPetName}
                      onChange={e => setNewPetName(e.target.value)}
                      placeholder="e.g. Buddy"
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-semibold"
                    />
                  </div>
                  <div className="space-y-1 text-xs">
                    <label className="font-bold text-slate-700">Species *</label>
                    <select
                      value={newPetSpecies}
                      onChange={e => setNewPetSpecies(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-semibold cursor-pointer"
                    >
                      <option value="dog">Dog</option>
                      <option value="cat">Cat</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1 text-xs">
                    <label className="font-bold text-slate-700">Breed</label>
                    <input
                      type="text"
                      value={newPetBreed}
                      onChange={e => setNewPetBreed(e.target.value)}
                      placeholder="e.g. Labrador"
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-semibold"
                    />
                  </div>
                  <div className="space-y-1 text-xs">
                    <label className="font-bold text-slate-700">Size</label>
                    <select
                      value={newPetSize}
                      onChange={e => setNewPetSize(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-semibold cursor-pointer"
                    >
                      <option value="">Select Size</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                      <option value="giant">Giant</option>
                    </select>
                  </div>
                  <div className="space-y-1 text-xs col-span-2">
                    <label className="font-bold text-slate-700">Age (Years)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="40"
                      value={newPetAge}
                      onChange={e => setNewPetAge(e.target.value)}
                      placeholder="e.g. 2.5"
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-semibold"
                    />
                  </div>
                  <div className="space-y-1 text-xs col-span-2">
                    <label className="font-bold text-slate-700">Grooming / Temperament Notes</label>
                    <textarea
                      value={newPetNotes}
                      onChange={e => setNewPetNotes(e.target.value)}
                      placeholder="e.g. Friendly, afraid of blow dryers..."
                      rows={2}
                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-semibold resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowNewPetForm(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-650 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Back to List
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateAndAssignPet}
                    disabled={resolveActionLoading}
                    className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {resolveActionLoading ? 'Creating...' : 'Create & Assign'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification for new pending online bookings */}
      {showNewBookingToast && newBookingDetails && (
        <div className="fixed bottom-6 right-6 z-50 animate-slideUp max-w-sm w-full bg-white border border-indigo-150 rounded-2xl shadow-xl p-4 flex items-start space-x-3.5 border-l-4 border-l-indigo-600">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl shrink-0">
            <Bell className="w-5 h-5 text-indigo-600 animate-bounce" />
          </div>
          <div className="flex-grow min-w-0">
            <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide">
              New Booking Request
            </h4>
            <p className="text-slate-650 text-xs font-semibold mt-1 leading-normal">
              Online request received for <span className="font-bold text-slate-800">{newBookingDetails.petName}</span> ({newBookingDetails.customerName}).
            </p>
            <div className="flex items-center space-x-3 mt-3.5">
              <button
                onClick={() => {
                  setShowNewBookingToast(false)
                  setActiveTab('awaiting')
                  setStatusFilter('all')
                }}
                className="text-xs font-black text-indigo-650 hover:text-indigo-800 transition-colors cursor-pointer bg-transparent border-none p-0"
              >
                View Request
              </button>
              <button
                onClick={() => setShowNewBookingToast(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-650 transition-colors cursor-pointer bg-transparent border-none p-0"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => setShowNewBookingToast(false)}
            className="text-slate-350 hover:text-slate-500 transition-colors cursor-pointer bg-transparent border-none p-0 shrink-0 self-start"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
