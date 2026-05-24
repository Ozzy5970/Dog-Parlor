import { supabase } from '../lib/supabase'

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
 * Calls the secure database RPC function to respect double bookings, blocked slots,
 * notice boundaries, and opening hours without leaking booking data.
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
    const { data, error } = await supabase.rpc('get_public_available_slots', {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_date: selectedDate,
    })

    if (error) throw error

    // Cast and parse response from RPC JSON payload
    let result = data
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result)
      } catch (e) {
        // Fallback if parsing fails
      }
    }

    if (!result || typeof result !== 'object') {
      return { slots: [], reason: 'Invalid response from availability service.' }
    }

    const slots = Array.isArray(result.slots) ? result.slots : []

    return {
      slots: slots.map((s: any) => ({
        start_time: s.start_time,
        end_time: s.end_time,
        label: s.label,
        disabled: !!s.disabled,
      })),
      reason: result.reason || undefined,
      hasFullDayClosure: !!result.hasFullDayClosure,
      hasPartialClosure: !!result.hasPartialClosure,
    }
  } catch (err: any) {
    console.error('[availabilityService] Error checking availability:', err)
    return { slots: [], reason: err.message || 'Failed to calculate available slots.' }
  }
}

