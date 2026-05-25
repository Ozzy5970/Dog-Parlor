import { useState, useEffect } from 'react'
import { ShieldCheck, Mail, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Privacy() {
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState<{
    name: string
    email: string | null
    phone: string | null
    address?: string | null
  } | null>(null)
  const [privacyContactText, setPrivacyContactText] = useState<string | null>(null)
  const [privacyPolicyText, setPrivacyPolicyText] = useState<string | null>(null)

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
            .select('privacy_contact_text, privacy_policy_text')
            .eq('business_id', bizData.id)
            .maybeSingle()

          if (settingsData) {
            setPrivacyContactText(settingsData.privacy_contact_text)
            setPrivacyPolicyText(settingsData.privacy_policy_text || null)
          }
        }
      } catch (err) {
        console.error('Error loading privacy details:', err)
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
        <p className="text-slate-500 font-semibold text-xs animate-pulse">Loading Privacy Policy...</p>
      </div>
    )
  }

  const hasContact = business && (business.email || business.phone || business.address)

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-4 font-sans text-slate-800 animate-fadeIn">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
          Privacy Policy
        </h1>
      </div>

      <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-6 font-medium text-slate-600">
        {privacyPolicyText ? (
          <div className="whitespace-pre-wrap">{privacyPolicyText}</div>
        ) : (
          <>
            <p>
              Your privacy is important to us. This Privacy Policy describes how we collect, use, and process your personal information in connection with our dog grooming appointment scheduling system. This policy is structured to align with the Protection of Personal Information Act (POPIA) of South Africa.
            </p>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">1. Information We Collect</h2>
              <p>We collect only the personal information required to book and manage grooming appointments. This includes:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Customer Name & Surname:</strong> To identify booking records.</li>
                <li><strong>Phone Number:</strong> To contact you about scheduling, reminders, or changes (including WhatsApp notifications).</li>
                <li><strong>Email Address:</strong> For confirmation emails and appointment updates.</li>
                <li><strong>Physical Address:</strong> If provided to our staff for household association or profile completeness.</li>
                <li><strong>Pet Details:</strong> Including pet name, species (dog/cat), breed, size, age, and groomer notes (behavior, medical conditions, temperament).</li>
                <li><strong>Booking History:</strong> A record of past and future grooming appointments, services requested, and notes.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">2. Why We Collect This Information</h2>
              <p>We process your personal information for the following specific purposes:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>To log and manage booking requests and finalise grooming appointments.</li>
                <li>To contact you regarding confirmation, changes, cancellations, or emergency updates about your pet.</li>
                <li>To maintain accurate care history records for your pet to provide consistent grooming services.</li>
                <li>To review business performance and improve parlour operational scheduling.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">3. Who Can Access Your Information</h2>
              <p>We restrict access to your information to protect your privacy:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Parlour Staff:</strong> Only authorised admins and groomers who require the info to perform grooming services.</li>
                <li><strong>Hosting and Infrastructure Partners:</strong> Secure cloud service providers used to host this app (e.g., Supabase for database storage, Vercel for hosting). These platforms adhere to strict data hosting security standards.</li>
              </ul>
              <p className="mt-2 font-bold text-slate-885">We do not sell, rent, or trade your personal information to third parties.</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">4. Your Data Rights</h2>
              <p>
                You have the right to request access to the personal information we hold about you, request updates to outdated records, or ask to delete your personal profile where legally permissible.
              </p>
            </section>
          </>
        )}

        <section className="space-y-2 bg-slate-50 border border-slate-200 p-5 rounded-xl text-slate-700">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
            <Mail className="w-4 h-4 text-indigo-650" />
            Contact & Enquiries
          </h2>
          <p>
            If you have questions about your privacy, would like to inspect your records, or request data corrections, please contact our business office:
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

          {privacyContactText && (
            <div className="mt-3.5 pt-3 border-t border-slate-200 text-xs font-semibold text-slate-500 leading-normal whitespace-pre-wrap">
              {privacyContactText}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
