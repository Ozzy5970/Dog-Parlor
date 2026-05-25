import { supabase } from '../lib/supabase'

export interface BusinessDetails {
  id: string
  name: string
  phone: string | null
  email: string | null
  address_line_1: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
}

export interface BookingSettings {
  id?: string
  business_id: string
  timezone: string
  whatsapp_number: string | null
  slot_interval_minutes: number
  booking_approval_mode: string
  min_notice_hours: number
  max_advance_days: number
  privacy_contact_text: string | null
  booking_policy_extra_notes: string | null
  terms_extra_notes: string | null
}

export interface OpeningHour {
  id?: string
  business_id: string
  day_of_week: number
  open_time: string | null
  close_time: string | null
  is_closed: boolean
}

export interface FullSettings {
  business: BusinessDetails
  settings: BookingSettings
  openingHours: OpeningHour[]
}

export async function fetchFullSettings(businessId: string): Promise<FullSettings> {
  // 1. Fetch business details
  const { data: businessData, error: businessErr } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single()

  if (businessErr) throw businessErr

  // 2. Fetch booking settings
  const { data: settingsData, error: settingsErr } = await supabase
    .from('business_settings')
    .select('*')
    .eq('business_id', businessId)
    .single()

  if (settingsErr) throw settingsErr

  // 3. Fetch opening hours
  const { data: hoursData, error: hoursErr } = await supabase
    .from('business_opening_hours')
    .select('*')
    .eq('business_id', businessId)
    .order('day_of_week', { ascending: true })

  if (hoursErr) throw hoursErr

  return {
    business: businessData as BusinessDetails,
    settings: settingsData as BookingSettings,
    openingHours: hoursData as OpeningHour[],
  }
}

export async function updateFullSettings(
  businessId: string,
  business: Partial<BusinessDetails>,
  settings: Partial<BookingSettings>,
  openingHours: Omit<OpeningHour, 'business_id'>[]
): Promise<void> {
  // 1. Update business details
  const { error: businessErr } = await supabase
    .from('businesses')
    .update(business)
    .eq('id', businessId)

  if (businessErr) throw businessErr

  // 2. Update booking settings
  const sanitizedSettings = {
    ...settings,
  }
  if (settings.privacy_contact_text !== undefined) {
    sanitizedSettings.privacy_contact_text = settings.privacy_contact_text?.trim() || null
  }
  if (settings.booking_policy_extra_notes !== undefined) {
    sanitizedSettings.booking_policy_extra_notes = settings.booking_policy_extra_notes?.trim() || null
  }
  if (settings.terms_extra_notes !== undefined) {
    sanitizedSettings.terms_extra_notes = settings.terms_extra_notes?.trim() || null
  }

  const { error: settingsErr } = await supabase
    .from('business_settings')
    .update(sanitizedSettings)
    .eq('business_id', businessId)

  if (settingsErr) throw settingsErr

  // 3. Upsert opening hours
  const hoursToUpsert = openingHours.map((oh) => ({
    id: oh.id,
    business_id: businessId,
    day_of_week: oh.day_of_week,
    open_time: oh.is_closed ? null : oh.open_time,
    close_time: oh.is_closed ? null : oh.close_time,
    is_closed: oh.is_closed,
  }))

  const { error: hoursErr } = await supabase
    .from('business_opening_hours')
    .upsert(hoursToUpsert, { onConflict: 'business_id,day_of_week' })

  if (hoursErr) throw hoursErr
}
