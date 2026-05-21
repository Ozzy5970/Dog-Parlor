import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Building2,
  Sliders,
  CalendarDays,
  ChevronLeft,
  Save
} from 'lucide-react'
import { PageHeader, SectionCard, FormField, AlertMessage, LoadingState } from '../../components/UI'
import {
  fetchFullSettings,
  updateFullSettings,
  type BusinessDetails,
  type BookingSettings,
  type OpeningHour,
} from '../../services/settingsService'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const TIMEZONES = [
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (GMT+2)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (GMT+1/GMT+2)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
]

export default function Settings() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form States
  const [business, setBusiness] = useState<Partial<BusinessDetails>>({
    name: '',
    phone: '',
    email: '',
    address_line_1: '',
    suburb: '',
    city: '',
    province: '',
    postal_code: '',
    country: '',
  })

  const [settings, setSettings] = useState<Partial<BookingSettings>>({
    timezone: 'Africa/Johannesburg',
    whatsapp_number: '',
    slot_interval_minutes: 30,
    min_notice_hours: 2,
    max_advance_days: 60,
  })

  const [openingHours, setOpeningHours] = useState<Omit<OpeningHour, 'business_id'>[]>([])

  useEffect(() => {
    if (authLoading) return

    if (!profile || !profile.business_id) {
      setError('You are not associated with a business profile.')
      setLoading(false)
      return
    }

    async function loadSettings() {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchFullSettings(profile!.business_id)

        setBusiness(data.business)
        setSettings(data.settings)

        // Initialize all 7 days, merging what we fetched
        const hours = DAYS_OF_WEEK.map((day) => {
          const existing = data.openingHours.find((oh) => oh.day_of_week === day.value)
          return {
            id: existing?.id,
            day_of_week: day.value,
            open_time: existing?.open_time ? existing.open_time.slice(0, 5) : '08:00',
            close_time: existing?.close_time ? existing.close_time.slice(0, 5) : '17:00',
            is_closed: existing ? existing.is_closed : day.value === 0, // default Sunday closed
          }
        })
        setOpeningHours(hours)
      } catch (err: any) {
        console.error('Error fetching settings:', err)
        setError(err.message || 'Failed to load business settings.')
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [profile, authLoading])

  const handleBusinessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setBusiness((prev) => ({ ...prev, [name]: value }))
  }

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setSettings((prev) => ({
      ...prev,
      [name]: name === 'timezone' || name === 'whatsapp_number' ? value : Number(value),
    }))
  }

  const handleHourToggle = (dayIndex: number) => {
    setOpeningHours((prev) =>
      prev.map((oh) => (oh.day_of_week === dayIndex ? { ...oh, is_closed: !oh.is_closed } : oh))
    )
  }

  const handleHourTimeChange = (dayIndex: number, field: 'open_time' | 'close_time', value: string) => {
    setOpeningHours((prev) =>
      prev.map((oh) => (oh.day_of_week === dayIndex ? { ...oh, [field]: value } : oh))
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile?.business_id) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    // Form Validations
    if (!business.name?.trim()) {
      setError('Business Name is required.')
      setSaving(false)
      return
    }

    if (!settings.slot_interval_minutes || settings.slot_interval_minutes <= 0) {
      setError('Slot interval must be greater than 0 minutes.')
      setSaving(false)
      return
    }

    if (settings.min_notice_hours === undefined || settings.min_notice_hours < 0) {
      setError('Minimum booking notice hours cannot be negative.')
      setSaving(false)
      return
    }

    if (!settings.max_advance_days || settings.max_advance_days <= 0) {
      setError('Maximum advance booking days must be greater than 0.')
      setSaving(false)
      return
    }

    // Opening Hours validation
    for (const oh of openingHours) {
      const dayLabel = DAYS_OF_WEEK.find((d) => d.value === oh.day_of_week)?.label ?? 'Unknown Day'
      if (!oh.is_closed) {
        if (!oh.open_time || !oh.close_time) {
          setError(`Please specify opening and closing times for ${dayLabel}.`)
          setSaving(false)
          return
        }
        if (oh.open_time >= oh.close_time) {
          setError(`For ${dayLabel}, opening time must be before closing time.`)
          setSaving(false)
          return
        }
      }
    }

    try {
      // Keep booking_approval_mode forced to 'manual_approval' per user request
      const updatedSettings = {
        ...settings,
        booking_approval_mode: 'manual_approval',
      }

      // Convert times back to format matching DB (HH:MM:00)
      const hoursToSubmit = openingHours.map((oh) => ({
        id: oh.id,
        day_of_week: oh.day_of_week,
        open_time: oh.is_closed ? null : `${oh.open_time}:00`,
        close_time: oh.is_closed ? null : `${oh.close_time}:00`,
        is_closed: oh.is_closed,
      }))

      await updateFullSettings(
        profile.business_id,
        {
          name: business.name,
          phone: business.phone || null,
          email: business.email || null,
          address_line_1: business.address_line_1 || null,
          suburb: business.suburb || null,
          city: business.city || null,
          province: business.province || null,
          postal_code: business.postal_code || null,
          country: business.country || null,
        },
        updatedSettings,
        hoursToSubmit
      )

      setSuccess('Settings saved successfully!')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      console.error('Error saving settings:', err)
      setError(err.message || 'An error occurred while saving settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading parlor settings..." />
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <PageHeader 
        title="Business Settings" 
        description="Manage your parlor details, hours, and booking rules."
        action={
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
        }
      />

      {/* Error & Success Feedback */}
      {error && (
        <AlertMessage type="error" message={error} />
      )}

      {success && (
        <AlertMessage type="success" message={success} />
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Section 1: Business Details */}
        <SectionCard 
          title="Business Details" 
          icon={<Building2 className="w-5 h-5" />}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField label="Business Name" required>
                <input
                  type="text"
                  name="name"
                  required
                  value={business.name || ''}
                  onChange={handleBusinessChange}
                  placeholder="e.g. Happy Paws Grooming"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <FormField label="Phone Number">
                <input
                  type="text"
                  name="phone"
                  value={business.phone || ''}
                  onChange={handleBusinessChange}
                  placeholder="e.g. +27 82 123 4567"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <div className="md:col-span-2">
                <FormField label="Email Address">
                  <input
                    type="email"
                    name="email"
                    value={business.email || ''}
                    onChange={handleBusinessChange}
                    placeholder="e.g. contact@happypaws.com"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                  />
                </FormField>
              </div>

              <div className="md:col-span-2">
                <FormField label="Address Line 1">
                  <input
                    type="text"
                    name="address_line_1"
                    value={business.address_line_1 || ''}
                    onChange={handleBusinessChange}
                    placeholder="e.g. 123 Bark Street"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                  />
                </FormField>
              </div>

              <FormField label="Suburb">
                <input
                  type="text"
                  name="suburb"
                  value={business.suburb || ''}
                  onChange={handleBusinessChange}
                  placeholder="e.g. Green Point"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <FormField label="City">
                <input
                  type="text"
                  name="city"
                  value={business.city || ''}
                  onChange={handleBusinessChange}
                  placeholder="e.g. Cape Town"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <FormField label="Province">
                <input
                  type="text"
                  name="province"
                  value={business.province || ''}
                  onChange={handleBusinessChange}
                  placeholder="e.g. Western Cape"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <FormField label="Postal Code">
                <input
                  type="text"
                  name="postal_code"
                  value={business.postal_code || ''}
                  onChange={handleBusinessChange}
                  placeholder="e.g. 8005"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <div className="md:col-span-2">
                <FormField label="Country">
                  <input
                    type="text"
                    name="country"
                    value={business.country || ''}
                    onChange={handleBusinessChange}
                    placeholder="e.g. South Africa"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                  />
                </FormField>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 2: Booking Rules */}
        <SectionCard 
          title="Booking Rules" 
          icon={<Sliders className="w-5 h-5" />}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField label="Timezone" required>
                <select
                  name="timezone"
                  value={settings.timezone || 'Africa/Johannesburg'}
                  onChange={handleSettingsChange}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="WhatsApp Number (Alerts)">
                <input
                  type="text"
                  name="whatsapp_number"
                  value={settings.whatsapp_number || ''}
                  onChange={handleSettingsChange}
                  placeholder="e.g. 27821234567"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <FormField label="Slot Interval (Minutes)" required>
                <input
                  type="number"
                  name="slot_interval_minutes"
                  min="1"
                  required
                  value={settings.slot_interval_minutes || ''}
                  onChange={handleSettingsChange}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <FormField label="Minimum Notice (Hours)" required>
                <input
                  type="number"
                  name="min_notice_hours"
                  min="0"
                  required
                  value={settings.min_notice_hours !== undefined ? settings.min_notice_hours : ''}
                  onChange={handleSettingsChange}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <FormField label="Maximum Advance Days" required>
                <input
                  type="number"
                  name="max_advance_days"
                  min="1"
                  required
                  value={settings.max_advance_days || ''}
                  onChange={handleSettingsChange}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              <FormField label="Booking Approval Mode">
                <input
                  type="text"
                  disabled
                  value="Manual Approval (Forced)"
                  className="w-full px-4 py-2.5 border border-slate-100 bg-slate-50 text-slate-400 rounded-xl cursor-not-allowed font-medium text-sm"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Booking modes cannot be changed at this stage.
                </span>
              </FormField>
            </div>
          </div>
        </SectionCard>

        {/* Section 3: Opening Hours */}
        <SectionCard 
          title="Opening Hours" 
          icon={<CalendarDays className="w-5 h-5" />}
        >
          <div className="divide-y divide-slate-100 -mx-6 -my-6">
            {DAYS_OF_WEEK.map((day) => {
              const row = openingHours.find((oh) => oh.day_of_week === day.value)
              if (!row) return null

              return (
                <div
                  key={day.value}
                  className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-150 ${
                    row.is_closed ? 'bg-slate-50/50 opacity-75' : 'bg-white opacity-100'
                  }`}
                >
                  <div className="flex items-center space-x-4 min-w-[150px]">
                    <button
                      type="button"
                      onClick={() => handleHourToggle(day.value)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                        !row.is_closed ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className="sr-only">Toggle Closed</span>
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          !row.is_closed ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="font-bold text-slate-700 text-sm">{day.label}</span>
                  </div>

                  <div className="flex items-center space-x-3">
                    {row.is_closed ? (
                      <span className="text-sm font-bold text-slate-400 italic">Closed</span>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <input
                          type="time"
                          required={!row.is_closed}
                          disabled={row.is_closed}
                          value={row.open_time || ''}
                          onChange={(e) =>
                            handleHourTimeChange(day.value, 'open_time', e.target.value)
                          }
                          className="px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 font-semibold text-sm"
                        />
                        <span className="text-slate-400 font-bold text-xs uppercase px-1">to</span>
                        <input
                          type="time"
                          required={!row.is_closed}
                          disabled={row.is_closed}
                          value={row.close_time || ''}
                          onChange={(e) =>
                            handleHourTimeChange(day.value, 'close_time', e.target.value)
                          }
                          className="px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 font-semibold text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-4 pt-4 border-t border-slate-200/80">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            disabled={saving}
            className="px-5 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl transition-all cursor-pointer text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-150 cursor-pointer text-sm disabled:opacity-50 flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

