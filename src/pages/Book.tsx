import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizeSaPhone } from '../lib/phone'
import { checkAvailability, type AvailableSlot } from '../services/availabilityService'
import { submitBookingRequest } from '../services/bookingRequestService'
import Turnstile from '../components/Turnstile'
import { utcToLocalTimeParts } from '../lib/dateTime'
import { FormField, AlertMessage } from '../components/UI'
import { 
  Scissors, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock, 
  PawPrint, 
  Loader2,
  AlertTriangle 
} from 'lucide-react'

interface Service {
  id: string
  name: string
  description: string | null
  dog_size: string | null
  duration_minutes: number
  price_cents: number
}

interface BusinessSettings {
  timezone: string
  max_advance_days: number
  min_notice_hours: number
  min_notice_minutes: number
  whatsapp_number: string | null
}

export default function Book() {
  const navigate = useNavigate()

  // Business & settings state
  const [business, setBusiness] = useState<{ id: string; name: string } | null>(null)
  const [settings, setSettings] = useState<BusinessSettings | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Wizard state
  const [step, setStep] = useState(1)
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)

  // Slots availability state
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [hasPartialClosure, setHasPartialClosure] = useState(false)

  // Customer & Pet details state
  const [fullName, setFullName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [petName, setPetName] = useState('')
  const [petBreed, setPetBreed] = useState('')
  const [petSize, setPetSize] = useState('small')
  const [petNotes, setPetNotes] = useState('')
  const [petAge, setPetAge] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [consentAgreed, setConsentAgreed] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState<number>(0)
  const [lastSubmitErrorCode, setLastSubmitErrorCode] = useState<string | null>(null)
  const [hadTokenAtSubmit, setHadTokenAtSubmit] = useState<boolean>(false)
  const [diagnosticVisible, setDiagnosticVisible] = useState<boolean>(false)

  // Helper: compute next likely valid bookable date starting from today
  const getNextValidBookableDateStr = (currentSettings?: BusinessSettings | null) => {
    const activeSettings = currentSettings || settings
    const tz = activeSettings?.timezone || 'Africa/Johannesburg'
    const minNoticeMinutes = activeSettings?.min_notice_minutes ?? (activeSettings?.min_notice_hours ? activeSettings.min_notice_hours * 60 : 5)
    
    const now = new Date()
    const earliestTime = new Date(now.getTime() + minNoticeMinutes * 60 * 1000)
    let current = utcToLocalTimeParts(earliestTime, tz)
    
    for (let i = 0; i < 7; i++) {
      const dateCheck = new Date(Date.UTC(current.year, current.month, current.day))
      const isTooLateForToday = i === 0 && current.hour >= 17
      
      const dayOfWeek = dateCheck.getUTCDay()
      if (dayOfWeek !== 0 && !isTooLateForToday) {
        return `${current.year}-${String(current.month + 1).padStart(2, '0')}-${String(current.day).padStart(2, '0')}`
      }
      
      const nextDay = new Date(dateCheck.getTime() + 24 * 60 * 60 * 1000)
      current = utcToLocalTimeParts(nextDay, tz)
    }
    
    const todayLocal = utcToLocalTimeParts(new Date(), tz)
    return `${todayLocal.year}-${String(todayLocal.month + 1).padStart(2, '0')}-${String(todayLocal.day).padStart(2, '0')}`
  }

  // Helper: compute today's date in business timezone
  const getTodayLocalStr = () => {
    const tz = settings?.timezone || 'Africa/Johannesburg'
    const nowLocal = utcToLocalTimeParts(new Date(), tz)
    return `${nowLocal.year}-${String(nowLocal.month + 1).padStart(2, '0')}-${String(nowLocal.day).padStart(2, '0')}`
  }

  // Helper: compute max allowed date in business timezone
  const getMaxDateStr = () => {
    const tz = settings?.timezone || 'Africa/Johannesburg'
    const maxAdvance = settings?.max_advance_days ?? 60
    const nowLocal = utcToLocalTimeParts(new Date(), tz)
    const todayLocalStart = new Date(Date.UTC(nowLocal.year, nowLocal.month, nowLocal.day))
    const maxAllowedDate = new Date(todayLocalStart.getTime() + maxAdvance * 24 * 60 * 60 * 1000)
    const maxYear = maxAllowedDate.getUTCFullYear()
    const maxMonth = maxAllowedDate.getUTCMonth() + 1
    const maxDay = maxAllowedDate.getUTCDate()
    return `${maxYear}-${String(maxMonth).padStart(2, '0')}-${String(maxDay).padStart(2, '0')}`
  }

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-').map(Number)
    const d = new Date(Date.UTC(year, month - 1, day))
    return d.toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  }

  // Load business details and active services
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError('')

        // Fetch the first business
        const { data: bizData, error: bizError } = await supabase
          .from('businesses')
          .select('id, name')
          .limit(1)
          .maybeSingle()

        if (bizError) throw bizError
        if (!bizData) {
          setError('No business found in the system.')
          return
        }

        setBusiness(bizData)

        // Fetch business settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('business_settings')
          .select('timezone, max_advance_days, min_notice_hours, min_notice_minutes, whatsapp_number')
          .eq('business_id', bizData.id)
          .maybeSingle()

        if (settingsError) throw settingsError

        const loadedSettings = {
          timezone: settingsData?.timezone || 'Africa/Johannesburg',
          max_advance_days: settingsData?.max_advance_days ?? 60,
          min_notice_hours: settingsData?.min_notice_hours ?? 2,
          min_notice_minutes: settingsData?.min_notice_minutes ?? 5,
          whatsapp_number: settingsData?.whatsapp_number || null,
        }
        setSettings(loadedSettings)
        setSelectedDate(getNextValidBookableDateStr(loadedSettings))

        // Fetch active services
        const { data: servicesData, error: servicesError } = await supabase
          .from('services')
          .select('id, name, description, dog_size, duration_minutes, price_cents')
          .eq('business_id', bizData.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })

        if (servicesError) throw servicesError
        setServices(servicesData || [])
      } catch (err: any) {
        console.error('Error loading booking initialization data:', err)
        setError(err.message || 'Failed to initialize booking flow.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Fetch available slots when service or date changes
  const loadSlots = async (serviceId: string, date: string) => {
    if (!business || !serviceId || !date) return
    setLoadingSlots(true)
    setSlotsError('')
    setSelectedSlot(null)
    setHasPartialClosure(false)
    try {
      const res = await checkAvailability(business.id, serviceId, date)
      setHasPartialClosure(!!res.hasPartialClosure)
      if (res.reason) {
        setSlotsError(res.reason)
        setSlots([])
      } else {
        setSlots(res.slots)
      }
    } catch (err: any) {
      setSlotsError(err.message || 'Failed to calculate available time slots.')
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  // Auto-load slots when entering Step 2
  useEffect(() => {
    if (step === 2 && selectedServiceId && selectedDate) {
      loadSlots(selectedServiceId, selectedDate)
    }
  }, [step, selectedServiceId, selectedDate])

  // Handle date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value
    setSelectedDate(newDate)
  }

  // Submit booking request
  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!business || !selectedServiceId || !selectedDate || !selectedSlot) return

    if (petAge) {
      const ageVal = parseFloat(petAge)
      if (isNaN(ageVal) || ageVal < 0 || ageVal > 40) {
        setSubmitError('Dog age must be between 0 and 40.')
        return
      }
    }

    setSubmitting(true)
    setSubmitError('')
    setLastSubmitErrorCode(null)
    setHadTokenAtSubmit(!!turnstileToken)
    setDiagnosticVisible(false)

    try {
      const result = await submitBookingRequest({
        business_id: business.id,
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        pet_name: petName.trim(),
        pet_breed: petBreed.trim() || null,
        pet_size: petSize,
        pet_notes: petNotes.trim() || null,
        service_id: selectedServiceId,
        start_time: selectedSlot.start_time,
        customer_notes: customerNotes.trim() || null,
        pet_age_years: petAge ? parseFloat(petAge) : null,
        surname: surname.trim() || null,
        turnstile_token: turnstileToken, // Pass token
      } as any)

      if (result.success) {
        const service = services.find((s) => s.id === selectedServiceId)
        navigate('/booking-success', {
          replace: true,
          state: {
            bookingDetails: {
              serviceName: service?.name || 'Grooming Service',
              start_time: selectedSlot.start_time,
              dateStr: selectedDate,
              timeStr: selectedSlot.label,
              customerName: `${fullName.trim()} ${surname.trim()}`.trim(),
              petName: petName.trim(),
              whatsappNumber: settings?.whatsapp_number || null,
            },
          },
        })
      } else {
        // Map backend errors to clean user messages
        let message = result.error || 'An unexpected error occurred while processing your booking. Please try again or contact the parlour.'
        
        if (result.error_code === 'TURNSTILE_FAILED') {
          message = 'Human verification expired or failed. Please verify again.'
        } else if (result.error_code === 'TURNSTILE_MISSING') {
          message = 'Human verification token is missing. Please solve the captcha.'
        } else if (result.error === 'Slot already taken' || result.error === 'Slot is blocked') {
          message = 'Sorry, that time was just taken. Please choose another available time.'
          // Reload slots immediately
          loadSlots(selectedServiceId, selectedDate)
          // Kick user back to date selection step
          setStep(2)
        } else if (result.error === 'Outside opening hours') {
          message = 'The selected slot is outside the business hours. Please select another slot.'
        } else if (result.error === 'Booking too soon') {
          message = 'This slot is too close to the current time. Parlour requires more advance notice.'
        } else if (result.error === 'Booking too far ahead') {
          message = 'This date is beyond the parlour\'s advance booking horizon. Please choose an earlier date.'
        } else if (result.error === 'Invalid service') {
          message = 'The selected grooming service is invalid or inactive. Please select another service.'
        } else if (result.error === 'Invalid business') {
          message = 'The business details could not be resolved. Please reload the page.'
        } else if (result.error === 'Invalid dog age') {
          message = 'Dog age must be between 0 and 40.'
        }
        setSubmitError(message)
        setLastSubmitErrorCode(result.error_code || 'UNKNOWN_ERROR')
        setDiagnosticVisible(true)
        // Reset turnstile widget on failure since the token is single-use
        setTurnstileToken(null)
        setTurnstileResetKey(prev => prev + 1)
      }
    } catch (err: any) {
      const msg = err.message || 'An unexpected connection error occurred. Please check your internet connection and try again.'
      setSubmitError(msg)
      setLastSubmitErrorCode('CLIENT_EXCEPTION')
      setDiagnosticVisible(true)
      // Reset turnstile widget on failure
      setTurnstileToken(null)
      setTurnstileResetKey(prev => prev + 1)
    } finally {
      setSubmitting(false)
    }
  }

  // Format date friendly for review
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

  // Get active service metadata
  const selectedService = services.find((s) => s.id === selectedServiceId)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin h-10 w-10 text-indigo-600 mb-4" />
        <p className="text-slate-500 font-semibold text-sm">Initializing Booking System...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16 max-w-md mx-auto">
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
          <AlertMessage type="error" message="" className="border-0 bg-transparent p-0 flex items-center" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Failed to Load</h2>
        <p className="text-slate-600 mb-6 text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-4">
      {/* Wizard Progress Header */}
      <div className="mb-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Book Appointment
          </h1>
          <span className="text-[11px] font-bold text-indigo-650 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider">
            Step {step} of 4
          </span>
        </div>

        {/* Custom Progress Bar with SVG Icons */}
        <div className="mt-8 relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-between">
            {/* Step 1 Indicator */}
            <button
              onClick={() => step > 1 && setStep(1)}
              disabled={step === 1}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                step >= 1
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-400'
              } ${step > 1 ? 'cursor-pointer hover:bg-indigo-700' : 'cursor-default'}`}
              title="Select Service"
            >
              <Scissors className="w-4 h-4" />
            </button>

            {/* Step 2 Indicator */}
            <button
              onClick={() => step > 2 && setStep(2)}
              disabled={step <= 2 || !selectedServiceId}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                step >= 2
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-400'
              } ${step > 2 ? 'cursor-pointer hover:bg-indigo-700' : 'cursor-default'}`}
              title="Select Date & Time"
            >
              <Calendar className="w-4 h-4" />
            </button>

            {/* Step 3 Indicator */}
            <button
              onClick={() => step > 3 && setStep(3)}
              disabled={step <= 3 || !selectedServiceId || !selectedDate || !selectedSlot}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                step >= 3
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-400'
              } ${step > 3 ? 'cursor-pointer hover:bg-indigo-700' : 'cursor-default'}`}
              title="Details"
            >
              <User className="w-4 h-4" />
            </button>

            {/* Step 4 Indicator */}
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-150 ${
                step === 4
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}
              title="Review & Confirm"
            >
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* STEP 1: SERVICE SELECTION */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Select a Grooming Service</h2>
            <p className="text-sm text-slate-500 font-medium">
              Please choose a service appropriate for your dog's size and needs.
            </p>
          </div>

          {services.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <p className="text-slate-500 font-bold">No services are currently active for booking.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {services.map((service) => (
                <div
                  key={service.id}
                  onClick={() => {
                    setSelectedServiceId(service.id)
                    // If moving forward, reset slot selection to avoid mismatched durations
                    if (selectedServiceId !== service.id) {
                      setSelectedSlot(null)
                      setSlots([])
                    }
                    setStep(2)
                  }}
                  className={`p-5 border-2 rounded-2xl cursor-pointer transition-all duration-150 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-indigo-400 hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                    selectedServiceId === service.id
                      ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600'
                      : 'border-slate-200/80 bg-white'
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-slate-950 text-base leading-snug">{service.name}</h3>
                      {service.dog_size && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                          {service.dog_size} dogs
                        </span>
                      )}
                    </div>
                    {service.description && (
                      <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed font-medium">
                        {service.description}
                      </p>
                    )}
                    <div className="flex items-center space-x-3 text-xs font-semibold text-slate-400 pt-1">
                      <span className="flex items-center">
                        <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        {service.duration_minutes} mins
                      </span>
                    </div>
                  </div>
                  <div className="text-right self-end md:self-center shrink-0">
                    <span className="text-xl font-black text-slate-900">
                      R {(service.price_cents / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: DATE & TIME SELECTION */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Select Date & Time</h2>
            <p className="text-sm text-slate-500 font-medium">
              Pick a date to calculate available slots for <span className="font-bold text-indigo-650">{selectedService?.name}</span> ({selectedService?.duration_minutes} mins).
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <FormField label="Booking Date" htmlFor="booking-date" required>
                <input
                  id="booking-date"
                  type="date"
                  required
                  min={getTodayLocalStr()}
                  max={getMaxDateStr()}
                  value={selectedDate}
                  onChange={handleDateChange}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker()
                    } catch (err) {
                      // Fallback for browsers that don't support showPicker
                    }
                  }}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white cursor-pointer text-slate-800 font-semibold text-sm"
                />
              </FormField>
              <p className="text-[10px] text-slate-400 mt-2 font-bold leading-normal">
                Choose a date between {formatDateShort(getTodayLocalStr())} and {formatDateShort(getMaxDateStr())}.
              </p>
            </div>

            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Available Start Times
              </span>
              
              {loadingSlots ? (
                <div className="space-y-2 py-4">
                  <div className="h-9 bg-slate-100 rounded-lg animate-pulse"></div>
                  <div className="h-9 bg-slate-100 rounded-lg animate-pulse"></div>
                  <div className="h-9 bg-slate-100 rounded-lg animate-pulse"></div>
                </div>
              ) : slotsError ? (
                <AlertMessage type="warning" message={slotsError} />
              ) : !selectedDate ? (
                <div className="py-8 text-center border border-slate-200/80 bg-slate-50/50 rounded-xl">
                  <p className="text-xs text-slate-400 font-bold">Please select a date first</p>
                </div>
              ) : slots.length === 0 ? (
                <div className="py-8 text-center bg-slate-50/55 border border-slate-200/80 rounded-xl">
                  <p className="text-sm text-slate-500 font-bold">No available slots on this day.</p>
                  <p className="text-xs text-slate-400 mt-1 font-semibold">Please try another date.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hasPartialClosure && (
                    <div className="p-3 bg-amber-50 border border-amber-250 text-amber-800 rounded-xl text-[11px] font-bold flex items-center space-x-1.5 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Limited availability on this date. Some times are unavailable.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {slots.map((slot) => (
                      <button
                        key={slot.start_time}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                          selectedSlot?.start_time === slot.start_time
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm ring-1 ring-indigo-600'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/30'
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-6 border-t border-slate-200/60">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-5 py-2.5 border border-slate-200 hover:border-slate-350 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!selectedDate || !selectedSlot || loadingSlots}
              onClick={() => setStep(3)}
              className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: DETAILS */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Pet & Owner Details</h2>
            <p className="text-sm text-slate-500 font-medium">
              Provide details about your dog and your contact details to submit the booking request.
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setStep(4); }} className="space-y-5">
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
              <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-200/60 pb-2">Owner Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="First Name" htmlFor="owner-name" required>
                  <input
                    id="owner-name"
                    type="text"
                    required
                    maxLength={80}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold"
                  />
                </FormField>
                <FormField label="Surname" htmlFor="owner-surname" optionalText="Optional">
                  <input
                    id="owner-surname"
                    type="text"
                    maxLength={80}
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    placeholder="Doe"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold"
                  />
                </FormField>
              </div>
              <FormField label="Phone Number" htmlFor="owner-phone" required>
                  <input
                    id="owner-phone"
                    type="tel"
                    required
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g., 082 123 4567"
                    className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all bg-white text-sm text-slate-850 font-semibold ${
                      phone && !normalizeSaPhone(phone) ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200'
                    }`}
                  />
                  {phone && !normalizeSaPhone(phone) && (
                    <p className="text-red-650 text-[10px] mt-1 font-bold">Please enter a valid phone number (e.g. 082 123 4567)</p>
                  )}
                </FormField>
              <FormField label="Email Address" htmlFor="owner-email" optionalText="Optional">
                <input
                  id="owner-email"
                  type="email"
                  maxLength={120}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@example.com"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold"
                />
              </FormField>
            </div>

            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
              <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-200/60 pb-2">Pet Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Pet Name" htmlFor="pet-name" required>
                  <input
                    id="pet-name"
                    type="text"
                    required
                    maxLength={80}
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    placeholder="Fido"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold"
                  />
                </FormField>
                <FormField label="Breed" htmlFor="pet-breed" optionalText="Optional">
                  <input
                    id="pet-breed"
                    type="text"
                    maxLength={80}
                    value={petBreed}
                    onChange={(e) => setPetBreed(e.target.value)}
                    placeholder="Poodle, Golden Retriever..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold"
                  />
                </FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Pet Size" htmlFor="pet-size" required>
                  <select
                    id="pet-size"
                    value={petSize}
                    onChange={(e) => setPetSize(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold"
                  >
                    <option value="small">Small (e.g. Yorkie, Maltese)</option>
                    <option value="medium">Medium (e.g. Cocker Spaniel, Beagle)</option>
                    <option value="large">Large (e.g. German Shepherd, Husky)</option>
                  </select>
                </FormField>
                <FormField label="Dog age" htmlFor="pet-age" optionalText="Optional">
                  <input
                    id="pet-age"
                    type="number"
                    step="0.1"
                    min="0"
                    max="40"
                    value={petAge}
                    onChange={(e) => setPetAge(e.target.value)}
                    placeholder="e.g. 3 or 0.5"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5 font-bold leading-normal">
                    Optional — use years, e.g. 0.5 for 6 months
                  </p>
                </FormField>
              </div>
              <div>
                <FormField label="Pet Notes / Temperament" htmlFor="pet-notes" optionalText="Optional">
                  <input
                    id="pet-notes"
                    type="text"
                    maxLength={500}
                    value={petNotes}
                    onChange={(e) => setPetNotes(e.target.value)}
                    placeholder="Nervous, hates nail clipping..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold"
                  />
                </FormField>
              </div>
            </div>

            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 space-y-2">
              <FormField label="Special Instructions / Booking Notes" htmlFor="customer-notes" optionalText="Optional">
                <textarea
                  id="customer-notes"
                  maxLength={500}
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Any additional details or requirements for this appointment..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white text-sm text-slate-850 font-semibold resize-none"
                />
              </FormField>
            </div>

            <div className="flex justify-between pt-6 border-t border-slate-200/60">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2.5 border border-slate-200 hover:border-slate-350 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!fullName.trim() || !normalizeSaPhone(phone) || !petName.trim() || (petAge !== '' && (parseFloat(petAge) < 0 || parseFloat(petAge) > 40))}
                className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                Review Booking
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 4: REVIEW & CONFIRM */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Review & Confirm</h2>
            <p className="text-sm text-slate-500 font-medium">
              Please double check all booking details before submitting.
            </p>
          </div>

          {submitError && (
            <AlertMessage type="error" message={submitError} />
          )}

          {diagnosticVisible && (
            <div className="p-4 bg-slate-100 border border-slate-300 rounded-2xl text-[11px] font-mono text-slate-800 space-y-1 animate-fadeIn">
              <span className="font-extrabold text-[10px] text-slate-500 uppercase tracking-wider block mb-1">System Diagnostic Report</span>
              <div><span className="font-bold">Error Code:</span> {lastSubmitErrorCode}</div>
              <div><span className="font-bold">Error Detail:</span> {submitError}</div>
              <div><span className="font-bold">Token Existed At Submit:</span> {hadTokenAtSubmit ? 'Yes' : 'No'}</div>
              <div><span className="font-bold">Domain:</span> {window.location.origin}</div>
            </div>
          )}

          <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-150 shadow-xs">
            {/* Service & Time */}
            <div className="p-5 bg-indigo-50/15 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-indigo-650 uppercase tracking-wider block">Grooming Session</span>
                <span className="text-lg font-bold text-slate-900 block flex items-center gap-1.5">
                  <Scissors className="w-4 h-4 text-indigo-600" />
                  {selectedService?.name}
                </span>
                <span className="text-xs text-slate-500 block font-medium">{selectedService?.duration_minutes} minutes duration</span>
                <span className="text-sm font-extrabold text-slate-800 block mt-1">
                  Price: R {(selectedService?.price_cents! / 100).toFixed(2)}
                </span>
              </div>
              <div className="space-y-1 sm:text-right">
                <span className="text-[10px] font-extrabold text-indigo-650 uppercase tracking-wider block">Requested Time</span>
                <span className="text-base font-bold text-slate-900 block">{formatDateFriendly(selectedDate)}</span>
                <span className="text-sm font-bold text-indigo-600 block mt-0.5">Starts at: {selectedSlot?.label}</span>
                <span className="text-[10px] text-slate-400 block font-semibold">Timezone: {settings?.timezone}</span>
              </div>
            </div>

            {/* Pet info */}
            <div className="p-5 bg-white space-y-3">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">Pet Details</span>
              <div className="grid gap-y-2 gap-x-6 sm:grid-cols-4 text-sm">
                <div>
                  <span className="text-slate-400 text-xs font-bold block">Pet Name</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <PawPrint className="w-3.5 h-3.5 text-slate-500" />
                    {petName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-bold block">Breed</span>
                  <span className="font-bold text-slate-800">{petBreed || 'Not Specified'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-bold block">Size Category</span>
                  <span className="font-bold text-slate-800 capitalize">{petSize} dog</span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-bold block">Dog Age</span>
                  <span className="font-bold text-slate-800">
                    {petAge ? `${petAge} ${parseFloat(petAge) === 1 ? 'year' : 'years'}` : 'Not Specified'}
                  </span>
                </div>
              </div>
              {petNotes && (
                <div className="text-sm pt-2">
                  <span className="text-slate-400 text-xs font-bold block">Pet Behavior / Notes</span>
                  <span className="text-slate-600 font-medium italic block bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/50 text-xs mt-1">"{petNotes}"</span>
                </div>
              )}
            </div>

            {/* Owner info */}
            <div className="p-5 bg-white space-y-3">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5">Owner Information</span>
              <div className="grid gap-y-2 gap-x-6 sm:grid-cols-3 text-sm">
                <div>
                  <span className="text-slate-400 text-xs font-bold block">Owner Name</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {fullName} {surname}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-bold block">Phone</span>
                  <span className="font-bold text-slate-800">{phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-bold block">Email Address</span>
                  <span className="font-bold text-slate-800">{email || 'Not Provided'}</span>
                </div>
              </div>
            </div>

            {/* Customer notes */}
            {customerNotes && (
              <div className="p-5 bg-white text-sm">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1.5 mb-2">
                  Customer Message / Special Instructions
                </span>
                <p className="text-slate-655 bg-slate-50/50 p-3 rounded-xl border border-slate-200/50 leading-relaxed font-semibold italic text-xs">
                  "{customerNotes}"
                </p>
              </div>
            )}
          </div>

          {/* Cloudflare Turnstile Bot Protection */}
          <Turnstile
            key={turnstileResetKey}
            sitekey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
            onVerify={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
          />

          {/* Consent Checkbox */}
          <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-3 text-xs font-semibold text-slate-650">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-0.5 h-4.5 w-4.5 rounded-lg border-slate-300 text-indigo-650 focus:ring-indigo-500 transition-all cursor-pointer accent-indigo-650 animate-fadeIn"
              />
              <span className="leading-relaxed">
                I agree that the parlour may use my details to manage my booking and contact me about this appointment. <span className="text-red-500">*</span>
              </span>
            </label>
            <p className="text-slate-405 pl-7.5 text-[11px] font-bold">
              By submitting this booking request, you agree to the{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Privacy Policy</a>
              {' '}and{' '}
              <a href="/booking-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-650 hover:underline">Booking Policy</a>.
            </p>
          </div>

          <div className="flex justify-between pt-6 border-t border-slate-200/60">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep(3)}
              className="px-5 py-2.5 border border-slate-200 hover:border-slate-350 rounded-xl text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              Back
            </button>
            <button
              type="button"
              disabled={submitting || !consentAgreed || !turnstileToken}
              onClick={handleSubmitBooking}
              className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center gap-2 cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-200" />
                  <span>Submitting Request...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Request Slot</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


