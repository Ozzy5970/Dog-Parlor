import { supabase } from '../lib/supabase'

export interface Booking {
  id: string
  business_id: string
  customer_id: string
  pet_id: string
  service_id: string
  start_time: string // ISO string
  end_time: string // ISO string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  source: 'online' | 'phone' | 'walk_in' | 'admin'
  customer_notes: string | null
  admin_notes: string | null
  created_at?: string
  updated_at?: string
  customer: {
    id: string
    created_at: string
    full_name: string
    phone: string
    email: string | null
  } | null
  pet: {
    name: string
    breed: string | null
    size: string | null
    age_years: number | null
  } | null
  service: {
    name: string
    duration_minutes: number
    price_cents: number
  } | null
}

export async function fetchAdminBookings(businessId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      customer:customers (
        id,
        created_at,
        full_name,
        phone,
        email
      ),
      pet:pets (
        name,
        breed,
        size,
        age_years
      ),
      service:services (
        name,
        duration_minutes,
        price_cents
      )
    `)
    .eq('business_id', businessId)
    .order('start_time', { ascending: false })

  if (error) throw error
  return data as any as Booking[]
}

export async function updateBookingStatus(
  businessId: string,
  bookingId: string,
  status: Booking['status'],
  adminNotes?: string | null
): Promise<Booking> {
  const updates: any = { status }
  if (adminNotes !== undefined) {
    updates.admin_notes = adminNotes
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .eq('business_id', businessId)
    .select(`
      *,
      customer:customers (
        id,
        created_at,
        full_name,
        phone,
        email
      ),
      pet:pets (
        name,
        breed,
        size,
        age_years
      ),
      service:services (
        name,
        duration_minutes,
        price_cents
      )
    `)
    .single()

  if (error) throw error
  return data as any as Booking
}

export async function updateBookingAdminNotes(
  businessId: string,
  bookingId: string,
  adminNotes: string | null
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ admin_notes: adminNotes })
    .eq('id', bookingId)
    .eq('business_id', businessId)
    .select(`
      *,
      customer:customers (
        id,
        created_at,
        full_name,
        phone,
        email
      ),
      pet:pets (
        name,
        breed,
        size,
        age_years
      ),
      service:services (
        name,
        duration_minutes,
        price_cents
      )
    `)
    .single()

  if (error) throw error
  return data as any as Booking
}

export async function fetchAdminBookingsForRange(
  businessId: string,
  startTimeIso: string,
  endTimeIso: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      customer:customers (
        id,
        created_at,
        full_name,
        phone,
        email
      ),
      pet:pets (
        name,
        breed,
        size,
        age_years
      ),
      service:services (
        name,
        duration_minutes,
        price_cents
      )
    `)
    .eq('business_id', businessId)
    .gte('start_time', startTimeIso)
    .lte('start_time', endTimeIso)
    .order('start_time', { ascending: true })

  if (error) throw error
  return data as any as Booking[]
}

// TODO: Analytics Preparation
// Future feature will group bookings by source, service, and status for dashboard reporting.
// e.g.
export interface BookingAnalyticsSummary {
  source: Record<string, number> // { online: 10, walk_in: 2 }
  status: Record<string, number> // { confirmed: 8, no_show: 1 }
  service_id: Record<string, number> // { "uuid": 5 }
  total_revenue_cents: number
}

/**
 * Lightweight helper to aggregate bookings for analytics
 */
export function aggregateBookings(bookings: Booking[]): BookingAnalyticsSummary {
  return bookings.reduce((acc, b) => {
    // Group by source
    acc.source[b.source] = (acc.source[b.source] || 0) + 1
    // Group by status
    acc.status[b.status] = (acc.status[b.status] || 0) + 1
    // Group by service
    acc.service_id[b.service_id] = (acc.service_id[b.service_id] || 0) + 1
    // Total revenue for completed/confirmed
    if (b.status === 'completed' || b.status === 'confirmed') {
      acc.total_revenue_cents += (b.service?.price_cents || 0)
    }
    return acc
  }, {
    source: {},
    status: {},
    service_id: {},
    total_revenue_cents: 0
  } as BookingAnalyticsSummary)
}

