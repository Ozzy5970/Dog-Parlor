import { supabase } from '../lib/supabase'

export interface AnalyticsBooking {
  id: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  source: 'online' | 'phone' | 'walk_in' | 'admin'
  service_id: string
  start_time: string // ISO string
  service: {
    name: string
    price_cents: number
    duration_minutes: number
  } | null
}

/**
 * Fetches bookings within a range, containing only non-private analytics-critical fields.
 */
export async function fetchAnalyticsData(
  businessId: string,
  startTimeIso: string,
  endTimeIso: string
): Promise<AnalyticsBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      source,
      service_id,
      start_time,
      service:services (
        name,
        price_cents,
        duration_minutes
      )
    `)
    .eq('business_id', businessId)
    .gte('start_time', startTimeIso)
    .lte('start_time', endTimeIso)
    .order('start_time', { ascending: true })

  if (error) {
    throw error
  }

  return (data || []) as any as AnalyticsBooking[]
}

/**
 * Retrieves the business's configured timezone from business_settings.
 */
export async function fetchBusinessTimezone(businessId: string): Promise<string> {
  const { data, error } = await supabase
    .from('business_settings')
    .select('timezone')
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.timezone || 'Africa/Johannesburg'
}
