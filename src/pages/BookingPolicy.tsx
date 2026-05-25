import { useState, useEffect } from 'react'
import { FileText, Mail, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function BookingPolicy() {
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState<{
    name: string
    email: string | null
    phone: string | null
    address?: string | null
  } | null>(null)
  const [bookingPolicyExtraNotes, setBookingPolicyExtraNotes] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const { data: bizData } = await supabase
          .from('businesses')
          .select('id, name, email, phone, address_line_1, suburb, city, province, postal_code, country')
          .limit(1)
          .maybeSingle()

        if (bizData) {
          const addressParts = [
            bizData.address_line_1,
            bizData.suburb,
            bizData.city,
            bizData.province,
            bizData.postal_code,
            bizData.country,
          ].filter(Boolean)

          setBusiness({
            name: bizData.name,
            email: bizData.email,
            phone: bizData.phone,
            address: addressParts.join(', ') || null,
          })

          const { data: settingsData } = await supabase
            .from('business_settings')
            .select('booking_policy_extra_notes')
            .eq('business_id', bizData.id)
            .maybeSingle()

          if (settingsData) {
            setBookingPolicyExtraNotes(settingsData.booking_policy_extra_notes)
          }
        }
      } catch (err) {
        console.error('Error loading booking policy page data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 font-sans">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-600 mb-2" />
        <p className="text-slate-500 font-semibold text-xs animate-pulse">Loading Booking Policy...</p>
      </div>
    )
  }

  const hasContact = business && (business.email || business.phone || business.address)

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-4 font-sans text-slate-800 animate-fadeIn">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
          <FileText className="w-6 h-6" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
          Booking Policy
        </h1>
      </div>

      <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-6 font-medium text-slate-600">
        <p>
          To ensure a smooth, stress-free grooming experience for all pets and owners, please review our booking policy rules before scheduling.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">1. Requests & Confirmations</h2>
          <p>
            All online submissions are considered pending requests. A slot is not reserved until our staff reviews it against daily groom scheduling capacity and issues an explicit confirmation notification.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">2. Cancellation & Rescheduling</h2>
          <p>
            We understand that schedules change. If you need to cancel or reschedule your appointment, please notify us as early as possible. This allows us to offer the slot to other clients on our waitlist.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">3. No-Shows & Late Arrivals</h2>
          <p>
            Missed appointments without prior notification may be flagged as **No-Shows** in our records. Frequent no-shows may limit your ability to request future online appointments.
          </p>
          <p>
            If you arrive late for your scheduled slot, we may be forced to truncate the service or reschedule your appointment to avoid delaying subsequent clients.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">4. Pet Health & Safety Conditions</h2>
          <p>
            For the safety of all pets and staff:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You must inform parlour staff of any pre-existing health issues, skin allergies, injuries, or behavioral concerns (such as fear of dryers or history of biting).</li>
            <li>We reserve the right to decline grooming sessions if a pet is deemed unfit, showing signs of contagious illness, or exhibits extreme aggression that poses a risk to safety.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">5. Collection & Emergencies</h2>
          <p>
            Pets should be collected promptly after their grooming session is completed. In the event of a medical emergency during grooming, staff will immediately contact the emergency number provided in the booking details. Collection and medical expense responsibility remain with the pet owner.
          </p>
        </section>

        <section className="space-y-2 bg-slate-50 border border-slate-200 p-5 rounded-xl text-slate-700">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
            <Mail className="w-4 h-4 text-indigo-650" />
            Contact & Support
          </h2>
          <p>
            If you have questions about bookings or cancellations, please get in touch:
          </p>
          
          {hasContact ? (
            <div className="mt-3 text-xs space-y-1 text-slate-700 font-bold">
              <p className="text-indigo-950 font-black text-sm">{business.name}</p>
              {business.email && (
                <p>Email: <span className="font-semibold text-slate-600">{business.email}</span></p>
              )}
              {business.phone && (
                <p>Phone: <span className="font-semibold text-slate-600">{business.phone}</span></p>
              )}
              {business.address && (
                <p>Address: <span className="font-semibold text-slate-600">{business.address}</span></p>
              )}
            </div>
          ) : (
            <p className="mt-2 font-bold text-slate-850 italic text-xs">
              Please contact the parlour directly using the contact details provided by the business.
            </p>
          )}

          {bookingPolicyExtraNotes && (
            <div className="mt-3.5 pt-3 border-t border-slate-200 text-xs font-semibold text-slate-500 leading-normal whitespace-pre-wrap">
              {bookingPolicyExtraNotes}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
