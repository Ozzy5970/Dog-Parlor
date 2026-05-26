import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { 
  CalendarRange, 
  Scissors, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Phone, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Info
} from 'lucide-react'

interface Service {
  id: string
  name: string
  description: string | null
  dog_size: string | null
  duration_minutes: number
  price_cents: number
}

interface BusinessDetails {
  name: string
  phone: string | null
  email: string | null
  address?: string | null
}

export default function Home() {
  const [business, setBusiness] = useState<BusinessDetails | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  useEffect(() => {
    async function loadHomeData() {
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
            bizData.country
          ].filter(Boolean)

          setBusiness({
            name: bizData.name,
            phone: bizData.phone,
            email: bizData.email,
            address: addressParts.join(', ') || null
          })

          const { data: settingsData } = await supabase
            .from('business_settings')
            .select('whatsapp_number')
            .eq('business_id', bizData.id)
            .maybeSingle()

          if (settingsData) {
            setWhatsappNumber(settingsData.whatsapp_number)
          }

          const { data: servicesData } = await supabase
            .from('services')
            .select('id, name, description, dog_size, duration_minutes, price_cents')
            .eq('business_id', bizData.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })

          if (servicesData) {
            setServices(servicesData)
          }
        }
      } catch (err) {
        console.error('Error loading home page data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadHomeData()
  }, [])

  const formatPrice = (cents: number): string => {
    return `R ${(cents / 100).toFixed(2)}`
  }

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index)
  }

  // Predefined FAQs
  const faqs = [
    {
      q: "Where is Groomers Dog Parlour located?",
      a: business?.address 
        ? `We are located at ${business.address}. Conveniently situated in Plumstead for dog owners across the Cape Town Southern Suburbs.`
        : "Groomers Dog Parlour is located in Plumstead, Cape Town. We serve pet owners across the Southern Suburbs including Wynberg, Diep River, Constantia, Kenilworth, and Tokai."
    },
    {
      q: "Can I book a dog grooming appointment online?",
      a: "Yes! You can choose your preferred service, select an available date and time slot, and submit your request directly through our online booking system. We will confirm your request via SMS or WhatsApp."
    },
    {
      q: "Is my booking confirmed immediately?",
      a: "No, online bookings are requests. We review each appointment request against our daily grooming calendar to ensure we have the correct staff available for your dog's size and service. You will receive a confirmation message once approved."
    },
    {
      q: "Do you groom small and large dogs?",
      a: "Yes, we accommodate all dog sizes, from small toy breeds up to large breeds. Our services are tailored to your dog's size and breed profile to ensure they get the best care."
    },
    {
      q: "Can I contact the parlour on WhatsApp?",
      a: whatsappNumber 
        ? `Absolutely! You can message us directly on WhatsApp at ${whatsappNumber} for any inquiries or manual booking updates.`
        : "Yes, you can contact us directly via WhatsApp. Contact information is available in our booking confirmations or at the parlour."
    }
  ]

  // Nearby suburbs string
  const nearbySuburbs = ["Diep River", "Wynberg", "Constantia", "Kenilworth", "Claremont", "Tokai", "Meadowridge"]

  return (
    <div className="space-y-16 md:space-y-24 font-sans text-slate-800 relative select-none">
      
      {/* Decorative Blob Accents (CSS Animated) */}
      <div className="absolute top-0 left-1/4 w-72 h-72 bg-indigo-100 rounded-full blur-3xl opacity-40 -z-10 animate-float"></div>
      <div className="absolute top-48 right-1/4 w-80 h-80 bg-rose-100 rounded-full blur-3xl opacity-30 -z-10 animate-float-delayed"></div>

      {/* 1. HERO SECTION */}
      <section className="relative flex flex-col items-center text-center py-6 sm:py-12 px-4 max-w-3xl mx-auto animate-slideUp">
        {/* Brand Logo Shell */}
        <div className="mb-6 sm:mb-8 flex justify-center hover:scale-105 transition-transform duration-300">
          <img 
            src="/logo.png" 
            alt="Groomers Dog Parlour Logo" 
            className="w-24 h-24 sm:w-32 sm:h-32 object-contain"
          />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-100 mb-4 tracking-wider uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Southern Suburbs Favourite</span>
        </span>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mt-2 mb-6 leading-tight">
          Dog Grooming in <span className="text-indigo-650 bg-gradient-to-r from-indigo-600 to-rose-600 bg-clip-text text-transparent">Plumstead</span>
        </h1>
        
        <p className="text-base sm:text-lg text-slate-700 mb-8 max-w-xl leading-relaxed font-semibold">
          Book grooming appointments online with Groomers Dog Parlour in Plumstead, Cape Town. Simple online booking for local dog grooming and professional pet care.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full">
          <Link
            to="/book"
            className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 border border-transparent text-sm font-black rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all duration-150 cursor-pointer gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 active:translate-y-0.5"
          >
            <CalendarRange className="w-5 h-5 stroke-[2.5]" />
            <span>Book an Appointment</span>
          </Link>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 border border-slate-200 text-sm font-black rounded-xl text-slate-700 hover:text-indigo-700 hover:bg-slate-50 transition-all duration-150 cursor-pointer gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <Phone className="w-4.5 h-4.5" />
              <span>WhatsApp Us</span>
            </a>
          )}
        </div>
      </section>

      {/* 2. LOCAL TRUST SECTION */}
      <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 sm:p-10 max-w-4xl mx-auto relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-bl-full -z-10"></div>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Scissors className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">About Our Parlour</h2>
          </div>
          <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-semibold">
            Groomers Dog Parlour is a local dog grooming parlour in Plumstead, Cape Town, serving pet owners across the Southern Suburbs. We prioritize hygiene, safety, and a calm environment so your dog feels relaxed and cared for throughout their stay.
          </p>
          <div className="pt-2">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2">Proudly Serving Southern Suburbs Neighborhoods:</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-md text-[11px] font-black text-indigo-700">Plumstead</span>
              {nearbySuburbs.map((suburb) => (
                <span key={suburb} className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-bold text-slate-600">
                  {suburb}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. SERVICES SECTION */}
      <section className="space-y-8 max-w-4xl mx-auto px-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Dog Grooming Services</h2>
          <p className="text-sm text-slate-700 font-semibold max-w-lg mx-auto">
            Choose from our premium range of grooming options tailored specifically for different dog sizes.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white h-48 rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                <div className="h-3 bg-slate-200 rounded w-full"></div>
                <div className="h-3 bg-slate-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : services.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {services.map((service) => (
              <div 
                key={service.id} 
                className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 flex flex-col justify-between hover:border-indigo-200 hover:shadow-sm transition-all duration-200"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <h3 className="font-extrabold text-slate-900 text-sm leading-tight capitalize">
                      {service.name}
                    </h3>
                    <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md shrink-0">
                      {service.dog_size || 'All Sizes'}
                    </span>
                  </div>
                  {service.description && (
                    <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                      {service.description}
                    </p>
                  )}
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-700 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{service.duration_minutes} mins</span>
                  </span>
                  <span className="text-slate-900 font-extrabold">
                    {formatPrice(service.price_cents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Fallback generic services list */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Full Grooming</h3>
              <p className="text-xs text-slate-700 font-semibold">Includes bath, blow-dry, brush-out, hair cut, nail clipping, and ear cleaning.</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Bath and Brush</h3>
              <p className="text-xs text-slate-700 font-semibold">Ideal for cleanups. Includes warm bath, blow-dry, brush-out, and nail clipping.</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2">
              <h3 className="font-extrabold text-slate-900 text-sm">Nail Clipping</h3>
              <p className="text-xs text-slate-700 font-semibold">Quick service to trim and shape your pet's nails safely.</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 p-3 bg-slate-50 border border-slate-200/60 rounded-xl max-w-xl mx-auto">
          <Info className="w-4 h-4 text-slate-550 shrink-0" />
          <span className="text-[11px] font-bold text-slate-700">
            Services and prices may vary. Confirm your dog's size and options when booking.
          </span>
        </div>
      </section>

      {/* 4. HOW BOOKING WORKS */}
      <section className="bg-slate-50 border border-slate-200/60 rounded-3xl p-8 sm:p-10 max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">How Online Booking Works</h2>
          <p className="text-xs sm:text-sm text-slate-700 font-semibold">Secure your dog's grooming session in three simple steps.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          <div className="flex flex-col items-center text-center space-y-3 p-4 bg-white rounded-2xl border border-slate-200/50 shadow-2xs">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <CalendarRange className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">1. Choose Service & Time</h3>
            <p className="text-xs text-slate-700 leading-relaxed font-semibold">
              Select your dog's size, desired treatment, and find a date and time slot that fits your schedule.
            </p>
          </div>

          <div className="flex flex-col items-center text-center space-y-3 p-4 bg-white rounded-2xl border border-slate-200/50 shadow-2xs">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Scissors className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">2. Submit Request</h3>
            <p className="text-xs text-slate-700 leading-relaxed font-semibold">
              Fill in your contact and pet details to send the request directly to the Groomers staff.
            </p>
          </div>

          <div className="flex flex-col items-center text-center space-y-3 p-4 bg-white rounded-2xl border border-slate-200/50 shadow-2xs">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">3. Groomers Confirms</h3>
            <p className="text-xs text-slate-700 leading-relaxed font-semibold">
              Our team reviews the schedule and confirms your slot via SMS or WhatsApp with arrival instructions.
            </p>
          </div>
        </div>
      </section>

      {/* 5. LOCATION SECTION */}
      <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 sm:p-10 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center space-x-2">
          <MapPin className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">Visit Groomers Dog Parlour</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Conveniently Located in Plumstead</h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-semibold">
              Our dog grooming parlour is easily accessible for dog owners across the Cape Town Southern Suburbs. We maintain a clean, well-ventilated, and secured grooming environment for dogs of all sizes.
            </p>
            {business?.address && (
              <div className="pt-2 text-xs font-black text-indigo-950">
                <p className="uppercase text-[10px] tracking-wider text-slate-400 font-bold mb-1">Physical Address:</p>
                <p className="flex items-start gap-1">
                  <MapPin className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span className="text-slate-805 leading-normal">{business.address}</span>
                </p>
              </div>
            )}
          </div>
          <div className="bg-slate-100/50 border border-slate-200 rounded-2xl p-6 flex flex-col justify-center items-center text-center space-y-2 min-h-[160px]">
            <MapPin className="w-10 h-10 text-indigo-300" />
            <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Plumstead, Cape Town</p>
            <p className="text-[11px] text-slate-700 font-semibold">Southern Suburbs, Western Cape</p>
          </div>
        </div>
      </section>

      {/* 6. FAQ SECTION */}
      <section className="space-y-6 max-w-3xl mx-auto px-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Frequently Asked Questions</h2>
          <p className="text-xs sm:text-sm text-slate-700 font-semibold">Quick answers to common questions about our parlour.</p>
        </div>

        <div className="space-y-3.5 pt-2">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx
            return (
              <div 
                key={idx}
                className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs transition-colors"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-4 text-left font-bold text-xs sm:text-sm text-slate-900 hover:text-indigo-600 flex justify-between items-center transition-colors focus:outline-none focus:bg-slate-50 cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{faq.q}</span>
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 border-t border-slate-50 text-xs sm:text-sm text-slate-700 leading-relaxed font-semibold">
                    {faq.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 7. FINAL CTA */}
      <section className="bg-indigo-600 rounded-3xl p-8 sm:p-12 text-white text-center space-y-6 max-w-4xl mx-auto shadow-xl relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute -bottom-8 -right-8 w-36 h-36 bg-indigo-500 rounded-full opacity-20"></div>
        <div className="space-y-3 relative z-10">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Ready for a Clean, Happy Dog?</h2>
          <p className="text-xs sm:text-sm font-semibold text-indigo-100 max-w-lg mx-auto">
            Our booking request takes less than two minutes. Let us know when you would like to bring your dog to Groomers.
          </p>
        </div>
        <div className="pt-2 relative z-10 flex justify-center">
          <Link
            to="/book"
            className="inline-flex items-center justify-center px-8 py-4 bg-white hover:bg-slate-50 text-indigo-750 text-sm font-black rounded-xl shadow-md transition-all duration-150 cursor-pointer gap-2 focus:outline-none focus:ring-2 focus:ring-white/20 active:translate-y-0.5"
          >
            <CalendarRange className="w-4.5 h-4.5 stroke-[2.5]" />
            <span>Book an Appointment Now</span>
          </Link>
        </div>
      </section>

    </div>
  )
}
