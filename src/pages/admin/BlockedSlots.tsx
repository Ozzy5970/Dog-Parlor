import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  CalendarDays,
  Pencil,
  Trash2,
  Plus,
  ChevronLeft,
  AlertTriangle
} from 'lucide-react'
import { PageHeader, SectionCard, FormField, AlertMessage, LoadingState, EmptyState } from '../../components/UI'
import { supabase } from '../../lib/supabase'
import { localTimeToUTC, utcToLocalTimeParts } from '../../lib/dateTime'
import {
  fetchBlockedSlots,
  createBlockedSlot,
  updateBlockedSlot,
  deleteBlockedSlot,
  type BlockedSlot,
} from '../../services/blockedSlotService'

// Helper to convert ISO string to browser's date-only input format (YYYY-MM-DD)
const toLocalDateOnlyWithTz = (isoString: string, timezone: string): string => {
  if (!isoString) return ''
  const date = new Date(isoString)
  const parts = utcToLocalTimeParts(date, timezone)
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

// Helper to convert ISO string to datetime-local input format (YYYY-MM-DDTHH:MM)
const toLocalDatetimeLocalWithTz = (isoString: string, timezone: string): string => {
  if (!isoString) return ''
  const date = new Date(isoString)
  const parts = utcToLocalTimeParts(date, timezone)
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

// Helper to convert local input string to UTC ISO string using business timezone
const toISOStringWithTz = (localString: string, timezone: string): string => {
  if (!localString) return ''
  
  // Format could be YYYY-MM-DD or YYYY-MM-DDTHH:MM
  const [datePart, timePart] = localString.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  
  let hour = 0
  let minute = 0
  let second = 0
  
  if (timePart) {
    const timeParts = timePart.split(':').map(Number)
    hour = timeParts[0] || 0
    minute = timeParts[1] || 0
    second = timeParts[2] || 0
  }
  
  return localTimeToUTC(year, month - 1, day, hour, minute, second, timezone).toISOString()
}

// Helper to check if blocked slot is a full-day closure
const isFullDayClosure = (slot: BlockedSlot, tz: string): boolean => {
  const startParts = utcToLocalTimeParts(new Date(slot.start_time), tz)
  const endParts = utcToLocalTimeParts(new Date(slot.end_time), tz)
  return startParts.hour === 0 && startParts.minute === 0 && endParts.hour === 23 && endParts.minute >= 59
}

// Helper to get formatted details for a slot
const getSlotDisplayInfo = (slot: BlockedSlot, tz: string) => {
  const startParts = utcToLocalTimeParts(new Date(slot.start_time), tz)
  const endParts = utcToLocalTimeParts(new Date(slot.end_time), tz)
  
  const isFullDay = startParts.hour === 0 && startParts.minute === 0 && endParts.hour === 23 && endParts.minute >= 59
  
  // Format date using business timezone
  const startDate = new Date(slot.start_time)
  const dateStr = startDate.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: tz
  })
  
  const startTimeStr = `${String(startParts.hour).padStart(2, '0')}:${String(startParts.minute).padStart(2, '0')}`
  const endTimeStr = `${String(endParts.hour).padStart(2, '0')}:${String(endParts.minute).padStart(2, '0')}`
  
  return {
    isFullDay,
    dateStr,
    timeRangeStr: isFullDay ? 'All Day' : `${startTimeStr} - ${endTimeStr}`
  }
}

export default function BlockedSlots() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()

  // State
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([])
  const [timezone, setTimezone] = useState('Africa/Johannesburg')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form Mode & State
  const [formMode, setFormMode] = useState<'full_day' | 'partial'>('partial')
  const [selectedDay, setSelectedDay] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    start_time: '',
    end_time: '',
    reason: '',
  })

  // Modal State for Confirm Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Load blocked slots and business settings
  const loadBlockedSlotsAndSettings = async (businessId: string) => {
    try {
      setLoading(true)
      setError(null)
      
      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('business_settings')
        .select('timezone')
        .eq('business_id', businessId)
        .maybeSingle()
        
      if (settingsError) throw settingsError
      if (settingsData?.timezone) {
        setTimezone(settingsData.timezone)
      }

      const data = await fetchBlockedSlots(businessId)
      setBlockedSlots(data)
    } catch (err: any) {
      console.error('Error fetching closures:', err)
      setError(err.message || 'Failed to load closures & unavailable times.')
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

    loadBlockedSlotsAndSettings(profile.business_id)
  }, [profile, authLoading])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const resetForm = () => {
    setEditingId(null)
    setSelectedDay('')
    setForm({
      start_time: '',
      end_time: '',
      reason: '',
    })
  }

  const handleEditClick = (slot: BlockedSlot) => {
    setEditingId(slot.id)
    const isFullDay = isFullDayClosure(slot, timezone)
    
    if (isFullDay) {
      setFormMode('full_day')
      setSelectedDay(toLocalDateOnlyWithTz(slot.start_time, timezone))
      setForm({
        start_time: '',
        end_time: '',
        reason: slot.reason || '',
      })
    } else {
      setFormMode('partial')
      setSelectedDay('')
      setForm({
        start_time: toLocalDatetimeLocalWithTz(slot.start_time, timezone),
        end_time: toLocalDatetimeLocalWithTz(slot.end_time, timezone),
        reason: slot.reason || '',
      })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile?.business_id) return

    setError(null)
    setSuccess(null)
    setSubmitting(true)

    // Validations
    if (formMode === 'full_day') {
      if (!selectedDay) {
        setError('Closure date is required.')
        setSubmitting(false)
        return
      }
      if (!form.reason.trim()) {
        setError('A reason is required for full-day closures.')
        setSubmitting(false)
        return
      }
    } else {
      if (!form.start_time) {
        setError('Start time is required.')
        setSubmitting(false)
        return
      }
      if (!form.end_time) {
        setError('End time is required.')
        setSubmitting(false)
        return
      }

      const startMs = new Date(form.start_time).getTime()
      const endMs = new Date(form.end_time).getTime()

      if (isNaN(startMs) || isNaN(endMs)) {
        setError('Invalid date or time selected.')
        setSubmitting(false)
        return
      }

      if (endMs <= startMs) {
        setError('End time must be after the start time.')
        setSubmitting(false)
        return
      }
    }

    try {
      let payload
      if (formMode === 'full_day') {
        payload = {
          start_time: toISOStringWithTz(`${selectedDay}T00:00:00`, timezone),
          end_time: toISOStringWithTz(`${selectedDay}T23:59:59`, timezone),
          reason: form.reason.trim(),
        }
      } else {
        payload = {
          start_time: toISOStringWithTz(form.start_time, timezone),
          end_time: toISOStringWithTz(form.end_time, timezone),
          reason: form.reason.trim() || null,
        }
      }

      if (editingId) {
        await updateBlockedSlot(profile.business_id, editingId, payload)
        setSuccess('Closure/time block updated successfully.')
      } else {
        await createBlockedSlot(profile.business_id, payload)
        setSuccess('Closure/time block created successfully.')
      }

      resetForm()
      await loadBlockedSlotsAndSettings(profile.business_id)
    } catch (err: any) {
      console.error('Error saving closure/time block:', err)
      setError(err.message || 'Failed to save closure or time block.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId || !profile?.business_id) return

    setError(null)
    setSuccess(null)
    const slotId = confirmDeleteId
    setConfirmDeleteId(null)

    try {
      await deleteBlockedSlot(profile.business_id, slotId)
      setSuccess('Closure/time block removed successfully.')
      await loadBlockedSlotsAndSettings(profile.business_id)
    } catch (err: any) {
      console.error('Error deleting closure/time block:', err)
      setError(err.message || 'Failed to delete closure or time block.')
    }
  }

  if (loading && blockedSlots.length === 0) {
    return <LoadingState message="Loading closures & unavailable times..." />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader 
        title="Closures & Unavailable Times" 
        description="Set and manage public holidays, full-day shop closures, staff breaks, and early closures."
        action={
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-655 text-sm font-bold rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 flex items-center space-x-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
        }
      />

      <div className="p-4 bg-indigo-50/50 border border-indigo-150 rounded-2xl text-xs font-semibold text-indigo-850 flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          <strong>How this works:</strong> Use this for public holidays, closed days, staff unavailable time, lunch breaks, or early closing. Full-day closures will block customer requests for the entire day, whereas partial-day closures block specific slots and display limited availability alerts to customers.
        </span>
      </div>

      {/* Global Alerts */}
      {error && <AlertMessage type="error" message={error} />}
      {success && <AlertMessage type="success" message={success} />}

      {/* Two-Column Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: List of Closures */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard 
            title="Active Closures & Unavailable Times" 
            icon={<CalendarDays className="w-5 h-5" />}
            headerAction={
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {blockedSlots.length} {blockedSlots.length === 1 ? 'Record' : 'Records'}
              </span>
            }
          >
            <div className="-mx-6 -my-6 divide-y divide-slate-100">
              {blockedSlots.length === 0 ? (
                <div className="p-6">
                  <EmptyState 
                    title="No Closures Defined" 
                    description="Your calendar has no custom closed blocks. Use the form on the right to add holiday closures or unavailable blocks."
                    icon={<CalendarDays className="w-12 h-12 text-slate-300" />}
                  />
                </div>
              ) : (
                blockedSlots.map((slot) => {
                  const display = getSlotDisplayInfo(slot, timezone)
                  return (
                    <div
                      key={slot.id}
                      className="p-6 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                          {display.isFullDay ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-red-50 text-red-700 border border-red-200 uppercase tracking-wider">
                              Full-Day Closure
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
                              Partial-Day
                            </span>
                          )}
                          {slot.reason && (
                            <span className="text-sm text-slate-700 font-semibold italic">
                              — "{slot.reason}"
                            </span>
                          )}
                        </div>

                        <div className="text-slate-600 text-xs font-semibold pt-1 space-y-1">
                          <div className="flex items-center space-x-2 text-slate-700">
                            <span className="font-extrabold text-slate-400 uppercase w-12">Date:</span>
                            <span className="font-sans text-slate-800">{display.dateStr}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-slate-700">
                            <span className="font-extrabold text-slate-400 uppercase w-12">Time:</span>
                            <span className="font-sans text-slate-800">{display.timeRangeStr}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 self-end sm:self-center">
                        <button
                          onClick={() => handleEditClick(slot)}
                          title="Edit Block"
                          className="p-2 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-500 hover:text-indigo-600 rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setConfirmDeleteId(slot.id)}
                          title="Delete Block"
                          className="p-2 border border-slate-200 hover:border-red-300 hover:bg-red-50/50 text-slate-400 hover:text-red-600 rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Create/Edit Form */}
        <div className="lg:col-span-1">
          <SectionCard 
            title={editingId ? 'Edit Closure / Block' : 'Create Closure / Block'} 
            className="sticky top-24"
          >
            <form onSubmit={handleFormSubmit} className="space-y-5">
              {/* Mode Selector */}
              <div className="space-y-2">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Closure Mode
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormMode('full_day')
                      setError(null)
                    }}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer focus:outline-none ${
                      formMode === 'full_day'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Full-Day Closure
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormMode('partial')
                      setError(null)
                    }}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer focus:outline-none ${
                      formMode === 'partial'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                    }`}
                  >
                    Partial-Day Block
                  </button>
                </div>
              </div>

              {/* Date selection for Full-Day Closure */}
              {formMode === 'full_day' && (
                <FormField label="Closure Date" required>
                  <input
                    type="date"
                    required
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker()
                      } catch (err) {}
                    }}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white cursor-pointer"
                  />
                </FormField>
              )}

              {/* Start & End Datetime for Partial block */}
              {formMode === 'partial' && (
                <>
                  <FormField label="Start Date & Time" required>
                    <input
                      type="datetime-local"
                      name="start_time"
                      required
                      value={form.start_time}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                    />
                  </FormField>
                  <FormField label="End Date & Time" required>
                    <input
                      type="datetime-local"
                      name="end_time"
                      required
                      value={form.end_time}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                    />
                  </FormField>
                </>
              )}

              {/* Reason */}
              <FormField 
                label="Reason / Description" 
                required={formMode === 'full_day'}
                optionalText={formMode === 'partial' ? 'optional' : undefined}
              >
                <textarea
                  name="reason"
                  rows={3}
                  value={form.reason}
                  onChange={handleInputChange}
                  placeholder={
                    formMode === 'full_day'
                      ? 'e.g. Christmas Day, Public Holiday, Annual shop maintenance...'
                      : 'e.g. Lunch break, Staff unavailable, Shop closes early...'
                  }
                  required={formMode === 'full_day'}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                />
              </FormField>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                {(editingId || selectedDay || form.start_time || form.end_time || form.reason) && (
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={submitting}
                    className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {editingId ? 'Cancel Edit' : 'Clear Form'}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>{editingId ? 'Save Changes' : (formMode === 'full_day' ? 'Add Closure' : 'Block Time')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Closure Block?</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-6 font-medium">
                Are you sure you want to delete this closure/unavailability record? Customers will immediately be allowed to request bookings during this time.
              </p>
              <div className="flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-650 text-sm font-bold rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20"
                >
                  Delete Block
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
