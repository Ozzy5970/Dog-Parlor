import { supabase } from '../lib/supabase'
import { localTimeToUTC, utcToLocalTimeParts } from '../lib/dateTime'

export interface AvailableSlot {
  start_time: string // ISO string
  end_time: string // ISO string
  label: string // e.g. "09:00"
  disabled: boolean
}

export interface AvailabilityResult {
  slots: AvailableSlot[]
  reason?: string
  hasFullDayClosure?: boolean
  hasPartialClosure?: boolean
}

/**
 * Calculates all available booking start times for a given service on a specific date.
 * Scoped securely to the business tenant. Safe reads only.
 * 
 * @param businessId Unique ID of the parlour business.
 * @param serviceId Unique ID of the service being booked.
 * @param selectedDate Target booking date formatted as "YYYY-MM-DD" local to the parlour.
 */
export async function checkAvailability(
  businessId: string,
  serviceId: string,
  selectedDate: string
): Promise<AvailabilityResult> {
  // 1. Validate date input string format
  if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return { slots: [], reason: 'Invalid date format. Expected YYYY-MM-DD.' }
  }

  try {
    const [year, month, day] = selectedDate.split('-').map(Number)
    // Parse the date components as a local date digits on a neutral UTC scale
    const localDigitsDate = new Date(Date.UTC(year, month - 1, day))
    const dayOfWeek = localDigitsDate.getUTCDay()

    // 2. Fetch business settings (timezone, min_notice_hours, slot_interval_minutes, max_advance_days)
    const { data: settings, error: settingsError } = await supabase
      .from('business_settings')
      .select('timezone, slot_interval_minutes, min_notice_hours, max_advance_days')
      .eq('business_id', businessId)
      .maybeSingle()

    if (settingsError) throw settingsError

    const timezone = settings?.timezone || 'Africa/Johannesburg'
    const interval = settings?.slot_interval_minutes || 30
    const minNoticeHours = settings?.min_notice_hours ?? 2
    const maxAdvanceDays = settings?.max_advance_days ?? 60

    // Date validation bounds check (selectedDate cannot be in the past or exceed max advance days)
    const now = new Date()
    const nowLocalParts = utcToLocalTimeParts(now, timezone)
    const todayLocalStart = new Date(Date.UTC(nowLocalParts.year, nowLocalParts.month, nowLocalParts.day))
    
    // Check if selected date is in the past relative to today local time
    if (localDigitsDate.getTime() < todayLocalStart.getTime()) {
      return { slots: [], reason: 'Selected date is in the past.' }
    }

    // Check if selected date exceeds maximum advance booking days
    const maxAllowedDate = new Date(todayLocalStart.getTime() + maxAdvanceDays * 24 * 60 * 60 * 1000)
    if (localDigitsDate.getTime() > maxAllowedDate.getTime()) {
      return { slots: [], reason: 'Selected date exceeds the maximum advance booking limit.' }
    }

    // 3. Fetch opening hours for the day of week of the selected date
    const { data: openingHour, error: ohError } = await supabase
      .from('business_opening_hours')
      .select('open_time, close_time, is_closed')
      .eq('business_id', businessId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    if (ohError) throw ohError

    if (!openingHour || openingHour.is_closed || !openingHour.open_time || !openingHour.close_time) {
      return { slots: [], reason: 'The business is closed on this day.' }
    }

    // 4. Fetch the grooming service details (duration_minutes and is_active)
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('duration_minutes, is_active')
      .eq('id', serviceId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (serviceError) throw serviceError

    if (!service) {
      return { slots: [], reason: 'Grooming service not found.' }
    }

    if (!service.is_active) {
      return { slots: [], reason: 'This grooming service is currently inactive.' }
    }

    const duration = service.duration_minutes

    // 6. Compute UTC range bounds for the target day in the business's timezone
    // The day runs local 00:00:00 through local 23:59:59
    const startOfDayUTC = localTimeToUTC(year, month - 1, day, 0, 0, 0, timezone)
    const endOfDayUTC = localTimeToUTC(year, month - 1, day, 23, 59, 59, timezone)

    // 7. Fetch existing bookings that overlap this date (SAFE READS: start_time, end_time, status)
    // Overlap condition: Booking starts before day ends AND booking ends after day starts
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('start_time, end_time, status')
      .eq('business_id', businessId)
      .in('status', ['pending', 'confirmed'])
      .lt('start_time', endOfDayUTC.toISOString())
      .gt('end_time', startOfDayUTC.toISOString())

    if (bookingsError) throw bookingsError

    // Fetch blocked slots that overlap this date
    const { data: blockedSlots, error: blockedError } = await supabase
      .from('blocked_slots')
      .select('start_time, end_time, reason')
      .eq('business_id', businessId)
      .lt('start_time', endOfDayUTC.toISOString())
      .gt('end_time', startOfDayUTC.toISOString())

    if (blockedError) throw blockedError

    // Determine full-day vs partial closures
    let hasFullDayClosure = false
    let hasPartialClosure = false

    if (blockedSlots && blockedSlots.length > 0) {
      hasFullDayClosure = blockedSlots.some((blocked: any) => {
        const bsStart = new Date(blocked.start_time).getTime()
        const bsEnd = new Date(blocked.end_time).getTime()
        // Allow 1 minute (60,000 ms) margin for timezone-bound adjustments
        return bsStart <= startOfDayUTC.getTime() + 60000 && bsEnd >= endOfDayUTC.getTime() - 60000
      })

      if (!hasFullDayClosure) {
        hasPartialClosure = true
      }
    }

    if (hasFullDayClosure) {
      return {
        slots: [],
        reason: 'The parlour is unavailable on this date. Please choose another day.',
        hasFullDayClosure: true,
        hasPartialClosure: false
      }
    }

    // 9. Generate candidate slots inside local opening hours
    const [openHour, openMin] = openingHour.open_time.split(':').map(Number)
    const [closeHour, closeMin] = openingHour.close_time.split(':').map(Number)
    const startMinutes = openHour * 60 + openMin
    const endMinutes = closeHour * 60 + closeMin

    const candidateSlots: AvailableSlot[] = []
    const earliestAllowedMs = now.getTime() + minNoticeHours * 60 * 60 * 1000

    for (let min = startMinutes; min + duration <= endMinutes; min += interval) {
      const slotStartHour = Math.floor(min / 60)
      const slotStartMin = min % 60

      const slotEndHour = Math.floor((min + duration) / 60)
      const slotEndMin = (min + duration) % 60

      // Map local candidate digits to absolute UTC Date objects
      const slotStartUTC = localTimeToUTC(year, month - 1, day, slotStartHour, slotStartMin, 0, timezone)
      const slotEndUTC = localTimeToUTC(year, month - 1, day, slotEndHour, slotEndMin, 0, timezone)

      // Respect minimum booking notice hours (remove slots occurring too soon)
      if (slotStartUTC.getTime() < earliestAllowedMs) {
        continue
      }

      // Check overlaps with existing bookings:
      // candidate_start < existing_end AND candidate_end > existing_start
      const overlapsBooking = bookings?.some((booking) => {
        const bStart = new Date(booking.start_time).getTime()
        const bEnd = new Date(booking.end_time).getTime()
        return slotStartUTC.getTime() < bEnd && slotEndUTC.getTime() > bStart
      })

      if (overlapsBooking) {
        continue
      }

      // Check overlaps with blocked slots:
      // candidate_start < blocked_end AND candidate_end > blocked_start
      const overlapsBlocked = blockedSlots?.some((blocked: any) => {
        const bsStart = new Date(blocked.start_time).getTime()
        const bsEnd = new Date(blocked.end_time).getTime()
        return slotStartUTC.getTime() < bsEnd && slotEndUTC.getTime() > bsStart
      })

      if (overlapsBlocked) {
        continue
      }

      const label = `${String(slotStartHour).padStart(2, '0')}:${String(slotStartMin).padStart(2, '0')}`

      candidateSlots.push({
        start_time: slotStartUTC.toISOString(),
        end_time: slotEndUTC.toISOString(),
        label,
        disabled: false,
      })
    }

    return { 
      slots: candidateSlots, 
      hasFullDayClosure: false, 
      hasPartialClosure: candidateSlots.length > 0 && hasPartialClosure 
    }
  } catch (err: any) {
    console.error('[availabilityService] Error checking availability:', err)
    return { slots: [], reason: err.message || 'Failed to calculate available slots.' }
  }
}
