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
}

export interface BookingRequestResult {
  success: boolean
  booking_id?: string
  error?: string
}

/**
 * Transactionally submits a new customer booking request via the database RPC.
 * Creates/matches the customer profile, inserts pet info, and schedules the booking in a single transaction.
 */
export async function submitBookingRequest(input: BookingRequestInput): Promise<BookingRequestResult> {
  try {
    const { data, error } = await supabase.rpc('submit_booking_request', {
      p_business_id: input.business_id,
      p_full_name: input.full_name,
      p_phone: input.phone,
      p_email: input.email || null,
      p_pet_name: input.pet_name,
      p_pet_breed: input.pet_breed || null,
      p_pet_size: input.pet_size || null,
      p_pet_notes: input.pet_notes || null,
      p_service_id: input.service_id,
      p_start_time: input.start_time,
      p_customer_notes: input.customer_notes || null,
      p_pet_age_years: input.pet_age_years !== undefined ? input.pet_age_years : null,
      p_surname: input.surname || null,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    // Cast response from RPC JSON payload
    return data as BookingRequestResult
  } catch (err: any) {
    return { success: false, error: err.message || 'An unexpected error occurred.' }
  }
}
