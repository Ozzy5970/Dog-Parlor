import { supabase } from '../lib/supabase'

export interface Booking {
  id: string
  business_id: string
  customer_id: string
  pet_id: string
  service_id: string
  start_time: string // ISO string
  end_time: string // ISO string
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'no_show' | 'arrived' | 'completed'
  source: 'online' | 'phone' | 'walk_in' | 'admin'
  customer_notes: string | null
  admin_notes: string | null
  payment_method?: 'cash' | 'card' | null
  arrived_at?: string | null
  completed_at?: string | null
  paid_at?: string | null
  created_at?: string
  updated_at?: string
  customer: {
    id: string
    created_at: string
    full_name: string
    phone: string
    email: string | null
    surname: string | null
    household_id?: string | null
    household?: {
      id: string
      name: string
      household_member_names: string[]
    } | null
  } | null
  pet: {
    id: string
    name: string
    breed: string | null
    size: string | null
    age_years: number | null
    species: string
    household_id?: string | null
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
        email,
        surname,
        household_id,
        household:households (
          id,
          name,
          household_member_names
        )
      ),
      pet:pets (
        id,
        name,
        breed,
        size,
        age_years,
        species,
        household_id
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
  adminNotes?: string | null,
  paymentMethod?: 'cash' | 'card' | null
): Promise<Booking> {
  // Enforce valid status transition rules
  let allowedPrevious: Booking['status'][] = []
  if (status === 'confirmed') {
    allowedPrevious = ['pending']
  } else if (status === 'declined') {
    allowedPrevious = ['pending']
  } else if (status === 'cancelled') {
    allowedPrevious = ['pending', 'confirmed']
  } else if (status === 'arrived') {
    allowedPrevious = ['confirmed']
  } else if (status === 'no_show') {
    allowedPrevious = ['confirmed', 'arrived']
  } else if (status === 'completed') {
    allowedPrevious = ['confirmed', 'arrived']
  } else {
    throw new Error('Invalid status transition')
  }

  const updates: any = { status }
  if (adminNotes !== undefined) {
    updates.admin_notes = adminNotes
  }

  if (status === 'arrived') {
    updates.arrived_at = new Date().toISOString()
  } else if (status === 'completed') {
    updates.completed_at = new Date().toISOString()
    updates.paid_at = new Date().toISOString()
    if (paymentMethod) {
      updates.payment_method = paymentMethod
    }
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .eq('business_id', businessId)
    .in('status', allowedPrevious)
    .select(`
      *,
      customer:customers (
        id,
        created_at,
        full_name,
        phone,
        email,
        surname,
        household_id,
        household:households (
          id,
          name,
          household_member_names
        )
      ),
      pet:pets (
        id,
        name,
        breed,
        size,
        age_years,
        species,
        household_id
      ),
      service:services (
        name,
        duration_minutes,
        price_cents
      )
    `)

  if (error) throw error
  
  if (!data || data.length === 0) {
    throw new Error('CONCURRENCY_ERROR')
  }
  
  return data[0] as any as Booking
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
        email,
        surname,
        household_id,
        household:households (
          id,
          name,
          household_member_names
        )
      ),
      pet:pets (
        id,
        name,
        breed,
        size,
        age_years,
        species,
        household_id
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
        email,
        surname,
        household_id,
        household:households (
          id,
          name,
          household_member_names
        )
      ),
      pet:pets (
        id,
        name,
        breed,
        size,
        age_years,
        species,
        household_id
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
    // Total revenue for completed only with cash/card payment
    if (b.status === 'completed' && (b.payment_method === 'cash' || b.payment_method === 'card')) {
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

export async function resolveBookingPet(bookingId: string, petId: string): Promise<void> {
  const { data, error } = await supabase.rpc('resolve_booking_pet', {
    p_booking_id: bookingId,
    p_pet_id: petId
  })
  if (error) throw error
  if (data && (data as any).success === false) {
    throw new Error((data as any).error || 'Failed to resolve pet assignment.')
  }
}

export async function createPetAndAssignToBooking(
  bookingId: string,
  details: {
    name: string
    species: string
    breed?: string | null
    size?: string | null
    age_years?: number | null
    notes?: string | null
  }
): Promise<string> {
  const { data, error } = await supabase.rpc('create_pet_for_booking_and_assign', {
    p_booking_id: bookingId,
    p_name: details.name,
    p_species: details.species,
    p_breed: details.breed || null,
    p_size: details.size || null,
    p_age_years: details.age_years || null,
    p_notes: details.notes || null
  })
  if (error) throw error
  if (data && (data as any).success === false) {
    throw new Error((data as any).error || 'Failed to create and assign pet.')
  }
  return (data as any).pet_id
}

export async function linkCustomerToHousehold(
  customerId: string,
  householdId: string
): Promise<{ success: boolean; warning?: string }> {
  const { data, error } = await supabase.rpc('link_customer_to_household', {
    p_customer_id: customerId,
    p_household_id: householdId
  })
  if (error) throw error
  if (data && (data as any).success === false) {
    throw new Error((data as any).error || 'Failed to link customer to household.')
  }
  return data as any
}


