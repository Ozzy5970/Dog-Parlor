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
  Sparkles,
  Info,
  Copy,
  ExternalLink
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
  address_line_1: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
}

export default function Home() {
  const [business, setBusiness] = useState<BusinessDetails | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

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
          setBusiness({
            name: bizData.name,
            phone: bizData.phone,
            email: bizData.email,
            address_line_1: bizData.address_line_1,
            suburb: bizData.suburb,
            city: bizData.city,
            province: bizData.province,
            postal_code: bizData.postal_code,
            country: bizData.country
          })

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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )

    const elements = document.querySelectorAll('.reveal')
    elements.forEach((el) => observer.observe(el))

    return () => {
      elements.forEach((el) => observer.unobserve(el))
    }
  }, [loading, services])

  const formatPrice = (cents: number): string => {
    return `R ${(cents / 100).toFixed(2)}`
  }

  // De-duplicates address fields if parts of city/province/postal are already inside address_line_1
  const renderAddress = () => {
    if (!business) return null

    const line1 = business.address_line_1?.trim() || ''
    
    const suburbStr = business.suburb?.trim() || ''
    const showSuburb = suburbStr && !line1.toLowerCase().includes(suburbStr.toLowerCase())
    
    const cityStr = business.city?.trim() || ''
    const provinceStr = business.province?.trim() || ''
    
    const cityProvinceParts = [
      line1.toLowerCase().includes(cityStr.toLowerCase()) ? '' : cityStr,
      line1.toLowerCase().includes(provinceStr.toLowerCase()) ? '' : provinceStr
    ].filter(Boolean)
    const cityProvince = cityProvinceParts.join(', ')

    const postalCodeStr = business.postal_code?.trim() || ''
    const showPostal = postalCodeStr && !line1.toLowerCase().includes(postalCodeStr.toLowerCase())

    const countryStr = business.country?.trim() || ''
    const showCountry = countryStr && !line1.toLowerCase().includes(countryStr.toLowerCase())

    const lines: string[] = []
    if (line1) lines.push(line1)
    if (showSuburb && suburbStr) lines.push(suburbStr)
    if (cityProvince) lines.push(cityProvince)
    if (showPostal && postalCodeStr) lines.push(postalCodeStr)
    if (showCountry && countryStr) lines.push(countryStr)

    if (lines.length === 0) {
      return <p className="text-slate-800 leading-normal font-semibold">Located in Plumstead, Cape Town.</p>
    }

    return (
      <div className="space-y-0.5 text-slate-900 leading-normal font-semibold text-xs sm:text-sm">
        {lines.map((line, idx) => (
          <p key={idx}>{line}</p>
        ))}
      </div>
    )
  }

  // Generates clean single-line address for Google Maps and Clipboard Copy
  const getFullAddressString = (): string => {
    if (!business) return ''

    const line1 = business.address_line_1?.trim() || ''
    
    const suburbStr = business.suburb?.trim() || ''
    const showSuburb = suburbStr && !line1.toLowerCase().includes(suburbStr.toLowerCase())
    
    const cityStr = business.city?.trim() || ''
    const provinceStr = business.province?.trim() || ''
    
    const cityProvinceParts = [
      line1.toLowerCase().includes(cityStr.toLowerCase()) ? '' : cityStr,
      line1.toLowerCase().includes(provinceStr.toLowerCase()) ? '' : provinceStr
    ].filter(Boolean)
    const cityProvince = cityProvinceParts.join(', ')

    const postalCodeStr = business.postal_code?.trim() || ''
    const showPostal = postalCodeStr && !line1.toLowerCase().includes(postalCodeStr.toLowerCase())

    const countryStr = business.country?.trim() || ''
    const showCountry = countryStr && !line1.toLowerCase().includes(countryStr.toLowerCase())

    const parts: string[] = []
    if (line1) parts.push(line1)
    if (showSuburb && suburbStr) parts.push(suburbStr)
    if (cityProvince) parts.push(cityProvince)
    if (showPostal && postalCodeStr) parts.push(postalCodeStr)
    if (showCountry && countryStr) parts.push(countryStr)

    return parts.join(', ') || 'Plumstead, Cape Town'
  }

  const handleCopyAddress = () => {
    const addressStr = getFullAddressString()
    if (!addressStr) return

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(addressStr)
        .then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
        .catch(err => {
          console.error('Failed to copy address:', err)
        })
    }
  }

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getFullAddressString())}`

  const nearbySuburbs = ["Diep River", "Wynberg", "Constantia", "Kenilworth", "Claremont", "Tokai", "Meadowridge"]

  return (
    <div className="space-y-16 md:space-y-24 font-sans text-slate-800 relative select-none">
      
      {/* Decorative Blob Accents (CSS Animated) */}
      <div className="absolute top-0 left-1/4 w-72 h-72 bg-indigo-100 rounded-full blur-3xl opacity-40 -z-10 animate-float"></div>
      <div className="absolute top-48 right-1/4 w-80 h-80 bg-rose-100 rounded-full blur-3xl opacity-30 -z-10 animate-float-delayed"></div>

      {/* 1. HERO SECTION */}
      <section className="relative flex flex-col items-center text-center py-6 sm:py-12 px-4 max-w-3xl mx-auto animate-slideUp">
        {/* Brand Logo */}
        <div className="mb-6 sm:mb-8 flex justify-center hover:scale-105 transition-transform duration-300">
          <img 
            src="/logo-transparent-optimized.png" 
            alt="Groomers Dog Parlour Logo" 
            width={128}
            height={128}
            loading="eager"
            decoding="async"
            fetchPriority="high"
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
          Book grooming appointments online with Groomers Dog Parlour in Plumstead, Cape Town.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full">
          <Link
            to="/book"
            className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 border border-transparent text-sm font-black rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all duration-150 cursor-pointer gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 active:translate-y-0.5"
          >
            <CalendarRange className="w-5 h-5 stroke-[2.5]" />
            <span>Book an Appointment</span>
          </Link>
          {business?.phone && (
            <a
              href={`tel:${business.phone.replace(/[^0-9+]/g, '')}`}
              className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 border border-slate-200 text-sm font-black rounded-xl text-slate-700 hover:text-indigo-700 hover:bg-slate-50 transition-all duration-150 cursor-pointer gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <Phone className="w-4.5 h-4.5" />
              <span>Call Us</span>
            </a>
          )}
        </div>
      </section>

      {/* 2. LOCAL TRUST SECTION */}
      <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 sm:p-10 max-w-4xl mx-auto relative overflow-hidden reveal reveal-slide-left">
        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-bl-full -z-10"></div>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Scissors className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">About Our Parlour</h2>
          </div>
          <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-semibold">
            Groomers Dog Parlour is a local pet grooming parlour in Plumstead, Cape Town. We prioritize safety, hygiene, and a calm atmosphere to ensure dogs from all across the Southern Suburbs feel comfortable and cared for.
          </p>
          <div className="pt-2">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2">Serving Pet Owners In:</h3>
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
            Choose from our range of services tailored specifically for different dog sizes.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white h-48 rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                <div className="h-3 bg-slate-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        ) : services.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {services.map((service, index) => {
              const delayClass = index % 3 === 0 ? '' : index % 3 === 1 ? 'delay-150' : 'delay-300';
              return (
                <div 
                  key={service.id} 
                  className={`bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 flex flex-col justify-between hover:border-indigo-200 hover:shadow-sm transition-all duration-200 reveal reveal-fade-up ${delayClass}`}
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
            )
          })}
        </div>
        ) : (
          /* Fallback generic services list */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 reveal reveal-fade-up">
              <h3 className="font-extrabold text-slate-900 text-sm">Full Grooming</h3>
              <p className="text-xs text-slate-700 font-semibold">Includes bath, blow-dry, brush-out, hair cut, nail clipping, and ear cleaning.</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 reveal reveal-fade-up delay-150">
              <h3 className="font-extrabold text-slate-900 text-sm">Bath and Brush</h3>
              <p className="text-xs text-slate-700 font-semibold">Includes warm bath, blow-dry, brush-out, and nail clipping.</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 reveal reveal-fade-up delay-300">
              <h3 className="font-extrabold text-slate-900 text-sm">Nail Clipping</h3>
              <p className="text-xs text-slate-700 font-semibold">Quick service to trim and shape your pet's nails safely.</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 p-3 bg-slate-50 border border-slate-200/60 rounded-xl max-w-xl mx-auto">
          <Info className="w-4 h-4 text-slate-550 shrink-0" />
          <span className="text-[11px] font-bold text-slate-700">
            Services and prices may vary. Confirm details when booking.
          </span>
        </div>
      </section>

      {/* 4. HOW BOOKING WORKS */}
      <section className="bg-slate-50 border border-slate-200/60 rounded-3xl p-8 sm:p-10 max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">How Online Booking Works</h2>
          <p className="text-xs sm:text-sm text-slate-700 font-semibold">Request your dog's next grooming session in three steps.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          <div className="flex flex-col items-center text-center space-y-3 p-4 bg-white rounded-2xl border border-slate-200/50 shadow-2xs reveal reveal-fade-up">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <CalendarRange className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">1. Choose Service & Time</h3>
            <p className="text-xs text-slate-700 leading-relaxed font-semibold">
              Select your dog's size, desired treatment, and pick an available date and time slot.
            </p>
          </div>

          <div className="flex flex-col items-center text-center space-y-3 p-4 bg-white rounded-2xl border border-slate-200/50 shadow-2xs reveal reveal-fade-up delay-150">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Scissors className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">2. Submit Request</h3>
            <p className="text-xs text-slate-700 leading-relaxed font-semibold">
              Provide your details and pet profile to send the request directly to our staff.
            </p>
          </div>

          <div className="flex flex-col items-center text-center space-y-3 p-4 bg-white rounded-2xl border border-slate-200/50 shadow-2xs reveal reveal-fade-up delay-300">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">3. Receive Confirmation</h3>
            <p className="text-xs text-slate-700 leading-relaxed font-semibold">
              Our team reviews the schedule and confirms your booking request via message.
            </p>
          </div>
        </div>
      </section>

      {/* 5. LOCATION SECTION */}
      <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 sm:p-10 max-w-4xl mx-auto space-y-6 reveal reveal-slide-right">
        <div className="flex items-center space-x-2">
          <MapPin className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">Visit Groomers Dog Parlour in Plumstead</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Find us behind Prosper</h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-semibold">
              Find Groomers Dog Parlour in Plumstead, behind Prosper. We’re conveniently located for dog owners in the Cape Town Southern Suburbs.
            </p>
            
            <div className="pt-2 text-xs text-slate-500 font-bold">
              <p className="uppercase text-[10px] tracking-wider mb-2">Physical Address:</p>
              <div className="flex items-start gap-1">
                <MapPin className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-2 w-full">
                  {renderAddress()}
                  
                  {business && (
                    <div className="pt-2 flex flex-wrap gap-2">
                      <button
                        onClick={handleCopyAddress}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-750 text-[11px] font-bold rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-550" />
                        <span>{copied ? 'Address copied' : 'Copy address'}</span>
                      </button>
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-750 hover:text-indigo-700 text-[11px] font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-550" />
                        <span>Open in Maps</span>
                      </a>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-700 font-medium italic pt-1.5">
                    Need help finding us? Contact the parlour and we’ll guide you to the entrance.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-slate-100/50 border border-slate-200 rounded-2xl p-6 flex flex-col justify-center items-center text-center space-y-2 min-h-[160px]">
            <MapPin className="w-10 h-10 text-indigo-300" />
            <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Plumstead, Cape Town</p>
            <p className="text-[11px] text-slate-700 font-semibold">Southern Suburbs, Western Cape</p>
          </div>
        </div>
      </section>

    </div>
  )
}
