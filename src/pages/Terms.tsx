import { useState, useEffect } from 'react'
import { Scale, Mail, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEFAULT_TERMS_OF_SERVICE } from '../lib/policyTemplates'

export default function Terms() {
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState<{
    name: string
    email: string | null
    phone: string | null
    address?: string | null
  } | null>(null)
  const [termsExtraNotes, setTermsExtraNotes] = useState<string | null>(null)
  const [termsOfServiceText, setTermsOfServiceText] = useState<string | null>(null)

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
            .select('terms_extra_notes, terms_of_service_text')
            .eq('business_id', bizData.id)
            .maybeSingle()

          if (settingsData) {
            setTermsExtraNotes(settingsData.terms_extra_notes)
            setTermsOfServiceText(settingsData.terms_of_service_text || null)
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
        <div className="whitespace-pre-wrap">{termsOfServiceText || DEFAULT_TERMS_OF_SERVICE}</div>

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
