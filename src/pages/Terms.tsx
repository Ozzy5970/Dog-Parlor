import { useState, useEffect } from 'react'
import { Scale, Mail, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Terms() {
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState<{
    name: string
    email: string | null
    phone: string | null
    address?: string | null
  } | null>(null)
  const [termsExtraNotes, setTermsExtraNotes] = useState<string | null>(null)

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
            .select('terms_extra_notes')
            .eq('business_id', bizData.id)
            .maybeSingle()

          if (settingsData) {
            setTermsExtraNotes(settingsData.terms_extra_notes)
          }
        }
      } catch (err) {
        console.error('Error loading terms page data:', err)
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
        <p className="text-slate-500 font-semibold text-xs animate-pulse">Loading Terms of Service...</p>
      </div>
    )
  }

  const hasContact = business && (business.email || business.phone || business.address)

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-4 font-sans text-slate-800 animate-fadeIn">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
          <Scale className="w-6 h-6" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
          Terms of Service
        </h1>
      </div>

      <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-6 font-medium text-slate-600">
        <p>
          Welcome to our appointment scheduling system. By accessing this platform or requesting a booking, you agree to comply with the terms and conditions outlined below.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">1. Booking Status & Confirmations</h2>
          <p>
            Submitting a booking request online <strong>does not constitute a final or guaranteed appointment</strong>. All online bookings are treated as pending requests and are subject to availability and review. Your appointment is only finalized once you receive a confirmation notification (via WhatsApp, email, or telephone) from our parlour staff.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">2. Customer Responsibilities</h2>
          <p>
            You agree to provide accurate and complete contact details (full name, email, and phone number) and pet context. Providing incorrect or inactive contact details may result in the automatic cancellation of your pending request.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">3. Right to Cancel or Reschedule</h2>
          <p>
            The parlour reserves the right to cancel, decline, or request to reschedule appointments at any time due to scheduling conflicts, staff availability, emergency closures, or pet safety concerns.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">4. App Availability & Warranties</h2>
          <p>
            This booking system is provided "as is" and "as available". We do not guarantee 100% uninterrupted availability of the application, scheduling interfaces, or notifications.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">5. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, the parlour and its developers shall not be liable for any indirect, incidental, or consequential losses, booking inconveniences, or damages arising out of the use of this software platform.
          </p>
        </section>

        <section className="space-y-2 bg-slate-50 border border-slate-200 p-5 rounded-xl text-slate-700">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
            <Mail className="w-4 h-4 text-indigo-650" />
            Contact & Queries
          </h2>
          <p>
            For questions regarding these terms, please contact:
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

          {termsExtraNotes && (
            <div className="mt-3.5 pt-3 border-t border-slate-200 text-xs font-semibold text-slate-500 leading-normal whitespace-pre-wrap">
              {termsExtraNotes}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
