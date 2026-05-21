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
    full_name: string
    phone: string
    email: string | null
  } | null
  pet: {
    name: string
    breed: string | null
    size: string | null
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
        full_name,
        phone,
        email
      ),
      pet:pets (
        name,
        breed,
        size
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
        full_name,
        phone,
        email
      ),
      pet:pets (
        name,
        breed,
        size
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
        full_name,
        phone,
        email
      ),
      pet:pets (
        name,
        breed,
        size
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
        full_name,
        phone,
        email
      ),
      pet:pets (
        name,
        breed,
        size
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

