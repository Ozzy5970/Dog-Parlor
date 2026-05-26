import { supabase } from '../lib/supabase'

export interface BookingRequestInput {
  business_id: string
  full_name: string
  phone: string
  email?: string | null
  pet_name: string
  pet_breed?: string | null
  pet_size?: string | null
  pet_notes?: string | null
  service_id: string
  start_time: string // ISO string
  customer_notes?: string | null
  pet_age_years?: number | null
  surname?: string | null
  turnstile_token: string | null
}

export interface BookingRequestResult {
  success: boolean
  booking_id?: string
  error?: string
  error_code?: string
}

/**
 * Intercepts public booking requests and sends them to the submit-booking-request Supabase Edge Function
 * for Turnstile validation and database RPC execution.
 */
export async function submitBookingRequest(input: BookingRequestInput): Promise<BookingRequestResult> {
  try {
    const { data, error } = await supabase.functions.invoke('submit-booking-request', {
      body: {
        booking_input: {
          business_id: input.business_id,
          full_name: input.full_name,
          phone: input.phone,
          email: input.email || null,
          pet_name: input.pet_name,
          pet_breed: input.pet_breed || null,
          pet_size: input.pet_size || null,
          pet_notes: input.pet_notes || null,
          service_id: input.service_id,
          start_time: input.start_time,
          customer_notes: input.customer_notes || null,
          pet_age_years: input.pet_age_years !== undefined ? input.pet_age_years : null,
          surname: input.surname || null,
        },
        turnstile_token: input.turnstile_token,
      }
    })

    if (error) {
      console.error('Edge Function invoke error:', error)
      let message = error.message || 'An unexpected error occurred while verifying details.'
      let error_code = 'SERVER_CONFIG_ERROR'
      try {
        const response = (error as any).context
        if (response && typeof response.json === 'function') {
          const parsed = await response.json()
          if (parsed) {
            if (parsed.error) message = parsed.error
            if (parsed.error_code) error_code = parsed.error_code
          }
        }
      } catch (_) {
        // ignore
      }
      return { success: false, error: message, error_code }
    }

    if (!data) {
      return { success: false, error_code: 'SERVER_CONFIG_ERROR', error: 'Empty response from booking service.' }
    }

    if (data.success === false) {
      return {
        success: false,
        error_code: data.error_code || 'BOOKING_RPC_FAILED',
        error: data.error || 'Request rejected.'
      }
    }

    return {
      success: true,
      error_code: 'BOOKING_SUCCESS',
      booking_id: data.booking_id
    }
  } catch (err: any) {
    console.error('submitBookingRequest client exception:', err)
    return { success: false, error_code: 'SERVER_CONFIG_ERROR', error: err.message || 'An unexpected connection error occurred.' }
  }
}


