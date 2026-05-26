import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { normalizeSaPhone } from '../../lib/phone'
import {
  Phone,
  Users,
  Calendar as CalendarIcon,
  Clock,
  Dog,
  User,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  FileText,
  Plus,
  X
} from 'lucide-react'
import {
  PageHeader,
  SectionCard,
  FormField,
  AlertMessage,
  LoadingState
} from '../../components/UI'
import { fetchServices, type Service } from '../../services/serviceService'
import { checkAvailability, type AvailableSlot } from '../../services/availabilityService'
import { adminSubmitBooking } from '../../services/manualBookingService'
import { utcToLocalTimeParts } from '../../lib/dateTime'
import { supabase } from '../../lib/supabase'

const sourceLabels: Record<string, string> = {
  phone: 'Phone',
  walk_in: 'Walk-in',
  admin: 'Other manual'
}

export default function NewBooking() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()

  // Business state
  const [services, setServices] = useState<Service[]>([])
  const [settings, setSettings] = useState<{ timezone: string, max_advance_days: number, min_notice_hours: number }>({
    timezone: 'Africa/Johannesburg',
    max_advance_days: 60,
    min_notice_hours: 2
  })
  const [loadingBusinessData, setLoadingBusinessData] = useState(true)

  // Helper: compute next likely valid bookable date starting from today
  const getNextValidBookableDateStr = (currentSettings?: any) => {
    const activeSettings = currentSettings || settings
    const tz = activeSettings?.timezone || 'Africa/Johannesburg'
    const minNotice = activeSettings?.min_notice_hours ?? 2
    
    const now = new Date()
    const earliestTime = new Date(now.getTime() + minNotice * 60 * 60 * 1000)
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
    const tz = settings.timezone
    const nowLocal = utcToLocalTimeParts(new Date(), tz)
    return `${nowLocal.year}-${String(nowLocal.month + 1).padStart(2, '0')}-${String(nowLocal.day).padStart(2, '0')}`
  }

  // Helper: compute max allowed date in business timezone
  const getMaxDateStr = () => {
    const tz = settings.timezone
    const maxAdvance = settings.max_advance_days
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

  // Step state (1: Source & Service, 2: Date & Time, 3: Client & Pet, 4: Summary)
  const [step, setStep] = useState(1)

  // Form State
  const [source, setSource] = useState<'phone' | 'walk_in' | 'admin'>('phone')
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)

  // Client Details
  const [clientName, setClientName] = useState('')
  const [clientSurname, setClientSurname] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')

  // Pet Details
  const [petName, setPetName] = useState('')
  const [petBreed, setPetBreed] = useState('')
  const [petSize, setPetSize] = useState<'small' | 'medium' | 'large'>('small')
  const [petNotes, setPetNotes] = useState('')
  const [petAge, setPetAge] = useState('')

  // Booking Notes
  const [customerNotes, setCustomerNotes] = useState('')
  const [adminNotes, setAdminNotes] = useState('')

  // Optional customer profile details
  const [showOptionalProfile, setShowOptionalProfile] = useState(false)
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [suburb, setSuburb] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('South Africa')
  const [extraNames, setExtraNames] = useState<string[]>([])
  const [newExtraName, setNewExtraName] = useState('')

  const addExtraName = () => {
    const trimmed = newExtraName.trim()
    if (trimmed && !extraNames.includes(trimmed)) {
      setExtraNames(prev => [...prev, trimmed])
      setNewExtraName('')
    }
  }

  const handleAddExtraName = (e: React.MouseEvent) => {
    e.preventDefault()
    addExtraName()
  }

  const handleExtraNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addExtraName()
    }
  }

  const handleRemoveExtraName = (nameToRemove: string) => {
    setExtraNames(prev => prev.filter(n => n !== nameToRemove))
  }

  // Operational states
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Step validations
  const isStep1Valid = !!selectedService
  const isStep2Valid = !!selectedDate && !!selectedSlot
  const isStep3Valid = !!clientName.trim() && !!normalizeSaPhone(clientPhone) && !!petName.trim() && (petAge === '' || (parseFloat(petAge) >= 0 && parseFloat(petAge) <= 40))

  // Load initial settings and services
  useEffect(() => {
    if (authLoading) return

    if (!profile?.business_id) {
      setLoadingBusinessData(false)
      return
    }

    async function loadData() {
      try {
        setLoadingBusinessData(true)
        
        // 1. Settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('business_settings')
          .select('timezone, max_advance_days, min_notice_hours')
          .eq('business_id', profile!.business_id)
          .maybeSingle()

        if (settingsError) throw settingsError
        
        const loadedSettings = {
          timezone: settingsData?.timezone || 'Africa/Johannesburg',
          max_advance_days: settingsData?.max_advance_days ?? 60,
          min_notice_hours: settingsData?.min_notice_hours ?? 2,
        }
        
        setSettings(loadedSettings)
        setSelectedDate(getNextValidBookableDateStr(loadedSettings))

        // 2. Services
        const servicesList = await fetchServices(profile!.business_id)
        // Only active services can be booked
        setServices(servicesList.filter(s => s.is_active))

      } catch (err) {
        console.error('Error loading manual booking setup data:', err)
      } finally {
        setLoadingBusinessData(false)
      }
    }

    loadData()
  }, [profile, authLoading])

  // Load slots when service or date change
  useEffect(() => {
    if (!profile?.business_id || !selectedService || !selectedDate) {
      setSlots([])
      setSelectedSlot(null)
      return
    }

    async function loadSlots() {
      try {
        setLoadingSlots(true)
        setSlotsError(null)
        setSelectedSlot(null)
        
        const res = await checkAvailability(profile!.business_id, selectedService!.id, selectedDate)
        
        if (res.reason) {
          setSlotsError(res.reason)
          setSlots([])
        } else {
          setSlots(res.slots)
        }
      } catch (err: any) {
        console.error('Error checking availability:', err)
        setSlotsError(err.message || 'Failed to calculate available slots.')
        setSlots([])
      } finally {
        setLoadingSlots(false)
      }
    }

    loadSlots()
  }, [selectedService, selectedDate, profile])

  // Handle manual submit logic
  const handleSubmit = async () => {
    if (!profile?.business_id || !selectedService || !selectedSlot) return

    if (petAge) {
      const ageVal = parseFloat(petAge)
      if (isNaN(ageVal) || ageVal < 0 || ageVal > 40) {
        setSubmitError('Dog age must be between 0 and 40.')
        return
      }
    }

    try {
      setSubmitting(true)
      setSubmitError(null)

      const result = await adminSubmitBooking({
        fullName: clientName,
        phone: clientPhone,
        email: clientEmail || null,
        petName: petName,
        petBreed: petBreed || null,
        petSize: petSize || null,
        petNotes: petNotes || null,
        serviceId: selectedService.id,
        startTimeIso: selectedSlot.start_time,
        source: source,
        customerNotes: customerNotes || null,
        adminNotes: adminNotes || null,
        petAgeYears: petAge ? parseFloat(petAge) : null,
        surname: clientSurname || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        suburb: suburb || null,
        city: city || null,
        province: province || null,
        postalCode: postalCode || null,
        country: country || 'South Africa',
        extraNames: extraNames
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to create booking.')
      }

      // Redirect back to bookings
      navigate('/admin/bookings', { state: { bookingCreated: true } })

    } catch (err: any) {
      console.error('Error creating manual booking:', err)
      
      const errMsg = err.message || ''
      if (errMsg.includes('Slot already taken') || errMsg.includes('overlap')) {
        setSubmitError('Schedule Conflict: This time slot is no longer available. Please select another slot or date.')
      } else if (errMsg.includes('Slot is blocked')) {
        setSubmitError('Schedule Conflict: This time slot is blocked. Please select another slot or date.')
      } else if (errMsg.includes('Outside opening hours')) {
        setSubmitError('Schedule Conflict: This time slot is outside business opening hours.')
      } else if (errMsg.includes('Booking too soon')) {
        setSubmitError('Schedule Conflict: Booking is too soon based on advance notice settings.')
      } else if (errMsg.includes('Booking too far ahead')) {
        setSubmitError('Schedule Conflict: Booking is too far ahead based on settings.')
      } else if (errMsg.includes('Invalid service')) {
        setSubmitError('Error: Invalid service selected.')
      } else {
        setSubmitError(errMsg || 'Failed to create booking. Please check details and try again.')
      }

      // Refresh slots
      if (selectedService && selectedDate) {
        setLoadingSlots(true)
        try {
          const res = await checkAvailability(profile.business_id, selectedService.id, selectedDate)
          if (!res.reason) setSlots(res.slots)
        } catch (e) {
          console.error(e)
        } finally {
          setLoadingSlots(false)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || loadingBusinessData) {
    return <LoadingState message="Loading parlor booking panel..." />
  }

  if (!profile?.business_id) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <AlertMessage
          type="error"
          message="Authorization Error: You are not associated with a business profile. Please contact support."
        />
      </div>
    )
  }

  // Format Helper: format local time for display
  const formatTime = (isoString: string): string => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatPrice = (cents: number): string => {
    return `R ${(cents / 100).toFixed(2)}`
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Manual Booking"
        description="Schedule phone calls, walk-ins, and direct admin appointments securely."
        action={
          <button
            onClick={() => navigate('/admin/bookings')}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            Cancel
          </button>
        }
      />

      {/* Wizard Steps Progress Indicator */}
      <div className="flex items-center justify-between max-w-lg mx-auto bg-slate-50 border border-slate-250/60 p-4 rounded-2xl">
        {[
          { num: 1, label: 'Service' },
          { num: 2, label: 'Schedule' },
          { num: 3, label: 'Customer' },
          { num: 4, label: 'Confirm' }
        ].map((s) => (
          <div key={s.num} className="flex items-center space-x-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                step === s.num
                  ? 'bg-indigo-600 text-white shadow-xs scale-105'
                  : step > s.num
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 text-slate-550'
              }`}
            >
              {step > s.num ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.num}
            </div>
            <span
              className={`text-xs font-bold ${
                step === s.num ? 'text-indigo-600' : 'text-slate-700'
              }`}
            >
              {s.label}
            </span>
            {s.num < 4 && <div className="h-px w-6 bg-slate-250 hidden sm:block" />}
          </div>
        ))}
      </div>

      {submitError && <AlertMessage type="error" message={submitError} />}

      {/* STEP 1: Source & Service Selection */}
      {step === 1 && (
        <div className="space-y-6">
          <SectionCard title="1. Booking Source">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'phone', label: 'Phone Call', icon: <Phone className="w-5 h-5 text-indigo-600" />, desc: 'Scheduled over phone call' },
                { key: 'walk_in', label: 'Walk-in Customer', icon: <Users className="w-5 h-5 text-indigo-600" />, desc: 'Walk-in appointment request' }
              ].map((src) => (
                <button
                  key={src.key}
                  type="button"
                  onClick={() => setSource(src.key as any)}
                  className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    source === src.key
                      ? 'border-indigo-600 bg-indigo-50/20 shadow-xs ring-2 ring-indigo-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      {src.icon}
                    </div>
                    {source === src.key && (
                      <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-800 text-sm">{src.label}</p>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed font-semibold">{src.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="2. Select Grooming Service">
            {services.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-xl text-center">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                <p className="font-bold text-slate-700">No active services setup</p>
                <p className="text-xs text-slate-400 mt-1">Please create active services under settings first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => {
                      setSelectedService(service)
                      // If moving forward, reset slot selection
                      if (selectedService?.id !== service.id) {
                        setSelectedSlot(null)
                        setSlots([])
                      }
                    }}
                    className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex justify-between items-start ${
                      selectedService?.id === service.id
                        ? 'border-indigo-600 bg-indigo-50/10 shadow-xs ring-2 ring-indigo-500/10'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="font-extrabold text-slate-900 text-sm">{service.name}</p>
                      {service.dog_size && (
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold rounded-full uppercase">
                          {service.dog_size} Dog
                        </span>
                      )}
                      <p className="text-slate-500 text-xs mt-2 leading-relaxed font-medium">
                        Duration: {service.duration_minutes} minutes
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-indigo-600 text-sm">
                        {formatPrice(service.price_cents)}
                      </p>
                      {selectedService?.id === service.id && (
                        <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-extrabold rounded-md uppercase">
                          Selected
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setStep(2)}
              disabled={!isStep1Valid}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>Choose Date & Time</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Date & Slot Selection */}
      {step === 2 && (
        <div className="space-y-6">
          <SectionCard title="3. Scheduling Date & Time">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Date Input */}
              <div className="md:col-span-1 space-y-4">
                <FormField label="Select Booking Date" required>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                      <CalendarIcon className="w-4 h-4" />
                    </span>
                    <input
                      type="date"
                      value={selectedDate}
                      min={getTodayLocalStr()}
                      max={getMaxDateStr()}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker()
                        } catch (err) {}
                      }}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white cursor-pointer"
                    />
                  </div>
                </FormField>
                <p className="text-[10px] text-slate-400 mt-2 font-bold leading-normal">
                  Choose a date between {formatDateShort(getTodayLocalStr())} and {formatDateShort(getMaxDateStr())}.
                </p>

                <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs font-semibold text-slate-500 space-y-2">
                  <p className="text-slate-600 font-extrabold uppercase tracking-wide text-[10px]">Service Info</p>
                  <p>Name: <span className="font-extrabold text-slate-850">{selectedService?.name}</span></p>
                  <p>Duration: <span className="font-extrabold text-slate-850">{selectedService?.duration_minutes} minutes</span></p>
                  <p>Timezone: <span className="font-extrabold text-slate-850">{settings.timezone}</span></p>
                </div>
              </div>

              {/* Time Slots Grid */}
              <div className="md:col-span-2 space-y-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Available Slots <span className="text-red-500">*</span>
                </label>

                {loadingSlots ? (
                  <div className="py-12 flex justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <LoadingState message="Checking parlour slot openings..." />
                  </div>
                ) : slotsError ? (
                  <AlertMessage type="warning" message={slotsError} />
                ) : !selectedDate ? (
                  <div className="py-12 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 bg-slate-50/50">
                    <Clock className="w-8 h-8 text-slate-350 mx-auto mb-3" />
                    <p className="text-xs font-bold text-slate-500">Select a Date First</p>
                    <p className="text-[11px] text-slate-400 mt-1">Please pick a date on the left to compute slot availability.</p>
                  </div>
                ) : slots.length === 0 ? (
                  <div className="py-12 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 bg-slate-50/50">
                    <Clock className="w-8 h-8 text-slate-350 mx-auto mb-3" />
                    <p className="text-xs font-bold text-slate-550">No Available Slots Found</p>
                    <p className="text-[11px] text-slate-400 mt-1">All slots might be fully booked or the business is closed on this date.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {slots.map((slot) => {
                      const isSelected = selectedSlot?.start_time === slot.start_time
                      return (
                        <button
                          key={slot.start_time}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`py-2 border text-xs font-bold rounded-xl text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          {slot.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-3 border border-slate-200 hover:bg-slate-50 text-slate-650 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!isStep2Valid}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>Add Client Details</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Customer & Pet details */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Owner Section */}
            <SectionCard title="4. Customer Profile" icon={<User className="w-4 h-4" />}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="First Name" required>
                    <input
                      type="text"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Enter first name..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                    />
                  </FormField>
                  <FormField label="Surname" optionalText="Optional">
                    <input
                      type="text"
                      value={clientSurname}
                      onChange={(e) => setClientSurname(e.target.value)}
                      placeholder="Enter surname..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                    />
                  </FormField>
                </div>

                <FormField label="Phone Number" required>
                  <input
                    type="tel"
                    required
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="e.g. 082 123 4567..."
                    className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white ${
                      clientPhone && !normalizeSaPhone(clientPhone) ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200'
                    }`}
                  />
                  {clientPhone && !normalizeSaPhone(clientPhone) && (
                    <p className="text-red-650 text-[10px] mt-1 font-bold">Please enter a valid phone number (e.g. 082 123 4567)</p>
                  )}
                </FormField>

                <FormField label="Email Address" optionalText="Optional">
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="e.g. client@example.com..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                  />
                </FormField>
              </div>
            </SectionCard>

            {/* Pet Section */}
            <SectionCard title="5. Pet Information" icon={<Dog className="w-4 h-4" />}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Pet Name" required>
                    <input
                      type="text"
                      required
                      value={petName}
                      onChange={(e) => setPetName(e.target.value)}
                      placeholder="Enter dog name..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                    />
                  </FormField>

                  <FormField label="Breed" optionalText="Optional">
                    <input
                      type="text"
                      value={petBreed}
                      onChange={(e) => setPetBreed(e.target.value)}
                      placeholder="e.g. Golden Retriever..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Dog Size" optionalText="Optional">
                    <select
                      value={petSize}
                      onChange={(e) => setPetSize(e.target.value as any)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white cursor-pointer"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </FormField>

                  <FormField label="Dog age" optionalText="Optional">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="40"
                      value={petAge}
                      onChange={(e) => setPetAge(e.target.value)}
                      placeholder="e.g. 3 or 0.5"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                    />
                  </FormField>
                </div>
                <p className="text-[10px] text-slate-400 font-bold leading-normal -mt-2">
                  Optional — use years, e.g. 0.5 for 6 months
                </p>

                <FormField label="Pet Grooming Notes" optionalText="Optional">
                  <textarea
                    value={petNotes}
                    onChange={(e) => setPetNotes(e.target.value)}
                    placeholder="e.g. Skin allergies, nervous behavior..."
                    rows={2}
                    className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                  />
                </FormField>
              </div>
            </SectionCard>
          </div>

          {/* Optional customer profile details collapsible section */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setShowOptionalProfile(!showOptionalProfile)}
              className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-55 transition-colors font-extrabold text-slate-800 text-sm border-b border-slate-200 select-none cursor-pointer focus:outline-none"
            >
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-indigo-500" />
                <span>Optional customer profile details</span>
              </div>
              <span className="text-xs text-slate-400 font-bold">
                {showOptionalProfile ? 'Hide Address & Alternate Names' : 'Add Address & Alternate Names'}
              </span>
            </button>
            
            {showOptionalProfile && (
              <div className="p-5 space-y-6 animate-fadeIn">
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  Use this when taking phone or walk-in bookings and you want to complete the customer profile now.
                </p>
                
                {/* Address Fields */}
                <div className="space-y-4">
                  <span className="text-[10px] font-black text-indigo-650 uppercase tracking-wider block border-b border-slate-100 pb-1">
                    Home Address
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Address Line 1" optionalText="Optional">
                      <input
                        type="text"
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        placeholder="Street name and number..."
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-850 text-xs bg-white"
                      />
                    </FormField>
                    <FormField label="Address Line 2" optionalText="Optional">
                      <input
                        type="text"
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                        placeholder="Complex unit, apartment number, etc..."
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-850 text-xs bg-white"
                      />
                    </FormField>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <FormField label="Suburb" optionalText="Optional">
                      <input
                        type="text"
                        value={suburb}
                        onChange={(e) => setSuburb(e.target.value)}
                        placeholder="e.g. Constantia"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-850 text-xs bg-white"
                      />
                    </FormField>
                    <FormField label="City" optionalText="Optional">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Cape Town"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-850 text-xs bg-white"
                      />
                    </FormField>
                    <FormField label="Province" optionalText="Optional">
                      <input
                        type="text"
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        placeholder="e.g. Western Cape"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-850 text-xs bg-white"
                      />
                    </FormField>
                    <FormField label="Postal Code" optionalText="Optional">
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="e.g. 7806"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-850 text-xs bg-white"
                      />
                    </FormField>
                  </div>
                  
                  <FormField label="Country" optionalText="Optional">
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-850 text-xs bg-white"
                    />
                  </FormField>
                </div>

                {/* Other Names on Profile */}
                <div className="space-y-2.5 pt-4 border-t border-slate-100">
                  <span className="text-[10px] font-black text-indigo-650 uppercase tracking-wider block">
                    Other Names on this profile
                  </span>
                  
                  {extraNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 bg-slate-50 p-3 border border-slate-150 rounded-xl">
                      {extraNames.map((name, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-850 font-extrabold text-[11px]"
                        >
                          <span>{name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveExtraName(name)}
                            className="text-slate-400 hover:text-red-650 p-0.5 rounded-md cursor-pointer transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newExtraName}
                      onChange={(e) => setNewExtraName(e.target.value)}
                      onKeyDown={handleExtraNameKeyDown}
                      placeholder="Add family member name, e.g. Andrea"
                      className="flex-grow px-4 py-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none text-slate-850 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={handleAddExtraName}
                      className="px-4 py-2.5 border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 font-bold rounded-xl flex items-center space-x-1 cursor-pointer text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Extra Notes */}
          <SectionCard title="6. Booking Instructions & Internal Notes" icon={<FileText className="w-4 h-4" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField label="Customer Booking Request notes" optionalText="Optional">
                <textarea
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Grooming details/requests from owner..."
                  rows={2}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                />
              </FormField>

              <FormField label="Internal Admin notes" optionalText="Optional">
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Notes visible only to parlour staff..."
                  rows={2}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                />
              </FormField>
            </div>
          </SectionCard>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(2)}
              className="px-5 py-3 border border-slate-200 hover:bg-slate-50 text-slate-650 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!isStep3Valid}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>Review Summary</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Review Summary & Submit */}
      {step === 4 && (
        <div className="space-y-6">
          <SectionCard title="Summary & Confirmation">
            <div className="divide-y divide-slate-100 space-y-6">
              {/* Service & Time details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block">Service Details</span>
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-150/60 space-y-1">
                    <p className="font-extrabold text-slate-900 text-sm">{selectedService?.name}</p>
                    {selectedService?.dog_size && (
                      <span className="inline-block px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-extrabold rounded-full uppercase">
                        {selectedService.dog_size} Dog
                      </span>
                    )}
                    <p className="text-slate-550 text-xs font-semibold pt-1">Duration: {selectedService?.duration_minutes} minutes</p>
                    <p className="text-indigo-600 font-black text-sm pt-2">Price: {selectedService ? formatPrice(selectedService.price_cents) : ''}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block">Schedule Time</span>
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-150/60 space-y-2">
                    <div>
                      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Selected Date</p>
                      <p className="font-extrabold text-slate-800 text-sm">{selectedDate}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Start Time</p>
                        <p className="font-extrabold text-indigo-600 text-sm">
                          {selectedSlot ? formatTime(selectedSlot.start_time) : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">End Time</p>
                        <p className="font-extrabold text-slate-700 text-sm">
                          {selectedSlot ? formatTime(selectedSlot.end_time) : ''}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold italic">Timezone: {settings.timezone}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Client & Pet Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block">Customer Details</span>
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-150/60 space-y-1 text-xs">
                    <p className="font-bold text-slate-800">{clientName} {clientSurname}</p>
                    <p className="text-slate-600 font-semibold">Phone: {clientPhone}</p>
                    {clientEmail && <p className="text-slate-600 font-semibold">Email: {clientEmail}</p>}
                    
                    {addressLine1 && (
                      <div className="pt-2 border-t border-slate-200/60 mt-1.5 space-y-0.5 text-slate-500 font-semibold">
                        <p className="text-[9px] font-black text-slate-700 uppercase tracking-wider">Address</p>
                        <p className="text-slate-700 font-bold">{addressLine1}</p>
                        {addressLine2 && <p className="text-slate-700 font-bold">{addressLine2}</p>}
                        <p>{suburb && `${suburb}, `}{city}</p>
                        <p>{province && `${province}, `}{postalCode}</p>
                        <p className="text-[10px] text-slate-500">{country}</p>
                      </div>
                    )}

                    {extraNames.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60 mt-1.5 space-y-1 text-slate-500 font-semibold">
                        <p className="text-[9px] font-black text-slate-700 uppercase tracking-wider">Other names on profile</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {extraNames.map((n, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold rounded-md">
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block">Pet Details</span>
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-150/60 space-y-1.5 text-xs">
                    <p className="font-bold text-slate-800">{petName}</p>
                    <div className="flex flex-wrap gap-1">
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-extrabold rounded-full uppercase">
                        Size: {petSize}
                      </span>
                      {petBreed && (
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-extrabold rounded-full">
                          {petBreed}
                        </span>
                      )}
                      {petAge && (
                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-extrabold rounded-full">
                          Age: {petAge} {parseFloat(petAge) === 1 ? 'year' : 'years'}
                        </span>
                      )}
                    </div>
                    {petNotes && (
                      <p className="text-slate-500 mt-2 bg-white rounded-lg p-2 border border-slate-200 italic">
                        Notes: {petNotes}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Booking Source & Notes Segment */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 text-xs">
                <div>
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block mb-1">Booking Source</span>
                  <span className="inline-block px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 font-extrabold rounded-xl uppercase">
                    {sourceLabels[source] || source}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block mb-1">Customer Notes</span>
                  <p className="text-slate-650 bg-slate-50 rounded-xl p-3 border border-slate-100 italic min-h-[50px]">
                    {customerNotes || 'No custom client notes.'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block mb-1">Internal Notes</span>
                  <p className="text-slate-650 bg-slate-50 rounded-xl p-3 border border-slate-100 min-h-[50px]">
                    {adminNotes || 'No internal notes.'}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setStep(3)}
              disabled={submitting}
              className="px-5 py-3 border border-slate-200 hover:bg-slate-50 text-slate-650 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Creating Booking...' : 'Confirm & Create Booking'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
