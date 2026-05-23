import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Search,
  User,
  Phone,
  Mail,
  Dog,
  Calendar,
  Clock,
  Users,
  Link as LinkIcon,
  Unlink,
  Check,
  Loader2,
  Bookmark,
  ChevronRight,
  MessageSquare
} from 'lucide-react'
import {
  PageHeader,
  SectionCard,
  EmptyState,
  AlertMessage,
  StatusBadge
} from '../../components/UI'
import {
  searchCustomers,
  fetchHouseholds,
  createHousehold,
  linkCustomerToHousehold,
  fetchHouseholdMembers,
  type CustomerHistory,
  type Household
} from '../../services/customerAdminService'
import { createWhatsAppLink, getGeneralCustomerMessage } from '../../lib/whatsapp'

// Helper to format ISO date to readable string
const formatLocalDate = (isoString: string): string => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Helper to format local time
const formatLocalTime = (isoString: string): string => {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function Customers() {
  const { profile } = useAuth()
  
  // States
  const [customers, setCustomers] = useState<CustomerHistory[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('the Parlour')
  
  // Selected Customer details
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [householdMembers, setHouseholdMembers] = useState<Array<{ id: string; full_name: string; surname: string | null; phone: string }>>([])
  
  // Household linking options
  const [households, setHouseholds] = useState<Household[]>([])
  const [showHouseholdLinker, setShowHouseholdLinker] = useState(false)
  const [selectedHouseholdId, setSelectedHouseholdId] = useState('')
  const [newHouseholdName, setNewHouseholdName] = useState('')
  const [linkingLoading, setLinkingLoading] = useState(false)

  // Derived state
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null

  const loadCustomers = async (bid: string, search: string) => {
    try {
      setLoading(true)
      setError(null)
      const data = await searchCustomers(bid, search)
      setCustomers(data)
      
      // If there's an active selected customer, keep it; otherwise default select first
      if (data.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(data[0].id)
      }
    } catch (err: any) {
      console.error('Error fetching customers list:', err)
      setError(err.message || 'Failed to search customers.')
    } finally {
      setLoading(false)
    }
  }

  // Load Initial Data & Business Details
  useEffect(() => {
    const bid = profile?.business_id
    if (!bid) return
    loadCustomers(bid, searchQuery)

    supabase
      .from('businesses')
      .select('name')
      .eq('id', bid)
      .single()
      .then(({ data }) => {
        if (data?.name) {
          setBusinessName(data.name)
        }
      })
  }, [profile])

  // Trigger search
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const bid = profile?.business_id
    if (!bid) return
    loadCustomers(bid, searchQuery)
  }

  // Load household members & settings on customer change
  useEffect(() => {
    const bid = profile?.business_id
    if (!bid || !selectedCustomer) {
      setHouseholdMembers([])
      return
    }

    async function loadMembers() {
      try {
        if (selectedCustomer?.household_id) {
          const members = await fetchHouseholdMembers(bid!, selectedCustomer.household_id, selectedCustomer.id)
          setHouseholdMembers(members)
        } else {
          setHouseholdMembers([])
        }
      } catch (err) {
        console.error('Error loading household members:', err)
      }
    }

    loadMembers()
    setShowHouseholdLinker(false)
    setSelectedHouseholdId('')
    setNewHouseholdName('')
  }, [selectedCustomerId, selectedCustomer, profile])

  // Load households lists for dropdown
  const handleOpenLinker = async () => {
    const bid = profile?.business_id
    if (!bid) return
    try {
      setShowHouseholdLinker(true)
      const list = await fetchHouseholds(bid)
      setHouseholds(list)
    } catch (err) {
      console.error('Failed to load households dropdown list:', err)
    }
  }

  // Submit household link
  const handleSaveHouseholdLink = async () => {
    const bid = profile?.business_id
    if (!bid || !selectedCustomer) return
    try {
      setLinkingLoading(true)
      let finalHouseholdId = selectedHouseholdId

      // Create new household if field populated
      if (newHouseholdName.trim()) {
        const newH = await createHousehold(bid, newHouseholdName.trim())
        finalHouseholdId = newH.id
      }

      if (!finalHouseholdId) {
        setError('Please select an existing household or type a new household name.')
        return
      }

      await linkCustomerToHousehold(bid, selectedCustomer.id, finalHouseholdId)
      
      // Reload customer list
      await loadCustomers(bid, searchQuery)
    } catch (err: any) {
      console.error('Error linking household:', err)
      setError(err.message || 'Failed to update household.')
    } finally {
      setLinkingLoading(false)
      setShowHouseholdLinker(false)
    }
  }

  // Unlink household
  const handleUnlinkHousehold = async () => {
    const bid = profile?.business_id
    if (!bid || !selectedCustomer) return
    try {
      setLinkingLoading(true)
      await linkCustomerToHousehold(bid, selectedCustomer.id, null)
      await loadCustomers(bid, searchQuery)
    } catch (err: any) {
      console.error('Error unlinking household:', err)
      setError(err.message || 'Failed to unlink household.')
    } finally {
      setLinkingLoading(false)
    }
  }

  // Summary visit counts
  const getBookingStats = (cust: CustomerHistory) => {
    const all = cust.bookings || []
    const completed = all.filter(b => b.status === 'completed')
    const pending = all.filter(b => b.status === 'pending')
    
    // Chronological sorting
    const sorted = [...all].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const past = sorted.filter(b => new Date(b.start_time) < new Date())
    const upcoming = sorted.filter(b => new Date(b.start_time) >= new Date() && (b.status === 'confirmed' || b.status === 'pending'))

    // Most used service
    const serviceCounts: Record<string, number> = {}
    all.forEach(b => {
      const name = b.service?.name || 'Unknown'
      serviceCounts[name] = (serviceCounts[name] || 0) + 1
    })
    const mostPopular = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

    return {
      total: all.length,
      completedCount: completed.length,
      upcomingCount: upcoming.length,
      pendingCount: pending.length,
      lastVisit: past.length > 0 ? past[past.length - 1].start_time : null,
      nextVisit: upcoming.length > 0 ? upcoming[0].start_time : null,
      mostPopularService: mostPopular,
      upcoming,
      past: [...past].reverse() // Show most recent past bookings first
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn text-slate-800">
      {/* Header */}
      <PageHeader
        title="Customer & Pet History"
        description="Search client profiles, review complete groom timelines, and link household accounts."
      />

      {error && <AlertMessage type="error" message={error} />}

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative flex-grow">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search by customer name, surname, phone number, or dog name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold text-slate-800 text-sm bg-white"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Search</span>}
        </button>
      </form>

      {/* Main Grid: Split List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Customers List */}
        <div className="lg:col-span-1 space-y-4">
          <SectionCard 
            title="Customers" 
            headerAction={
              <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-650 text-[10px] font-black rounded-full uppercase tracking-wider">
                {customers.length} Found
              </span>
            }
          >
            {loading && customers.length === 0 ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-indigo-650" />
              </div>
            ) : customers.length === 0 ? (
              <EmptyState
                title="No Customers Found"
                description="No client accounts match your search query."
                icon={<User className="w-8 h-8 text-slate-300" />}
              />
            ) : (
              <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto pr-1">
                {customers.map((c) => {
                  const stats = getBookingStats(c)
                  const isSelected = c.id === selectedCustomerId
                  const waLink = createWhatsAppLink(c.phone, getGeneralCustomerMessage(c.full_name, businessName))
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between group ${
                        isSelected 
                          ? 'bg-indigo-50 border border-indigo-150/40' 
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className={`font-extrabold text-sm truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                          {c.full_name} {c.surname}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500 font-semibold text-xs flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{c.phone}</span>
                          </p>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          {c.pets?.length || 0} {c.pets?.length === 1 ? 'dog' : 'dogs'} 
                          {stats.lastVisit ? ` • Last: ${formatLocalDate(stats.lastVisit)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 text-slate-450 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Message via WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </a>
                        )}
                        <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-indigo-600 translate-x-0.5' : 'text-slate-300 group-hover:text-slate-500'}`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right Column: Customer Details Slide-out */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <div className="space-y-6">
              
              {/* Card 1: Core Customer Info & Households */}
              <SectionCard title="Client Profile" icon={<User className="w-5 h-5" />}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Bio details */}
                  <div className="md:col-span-2 space-y-3.5 border-r border-slate-100 pr-0 md:pr-6">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-lg">
                        {selectedCustomer.full_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900 leading-tight">
                          {selectedCustomer.full_name} {selectedCustomer.surname}
                        </h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                          ID: {selectedCustomer.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-semibold text-slate-650 pt-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5">
                          <Phone className="w-4 h-4 text-slate-400" />
                          <span>{selectedCustomer.phone}</span>
                        </span>
                        {createWhatsAppLink(selectedCustomer.phone) && (
                          <a
                            href={createWhatsAppLink(selectedCustomer.phone, getGeneralCustomerMessage(selectedCustomer.full_name, businessName)) || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer text-[10px]"
                          >
                            <MessageSquare className="w-3 h-3 fill-current" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>
                      {selectedCustomer.email && (
                        <p className="flex items-center gap-1.5 truncate">
                          <Mail className="w-4 h-4 text-slate-400" />
                          <span className="truncate">{selectedCustomer.email}</span>
                        </p>
                      )}
                      <p className="flex items-center gap-1.5 col-span-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>Registered: {formatLocalDate(selectedCustomer.created_at)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Family / Household section */}
                  <div className="md:col-span-1 space-y-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Household / Family Link</span>
                    
                    {selectedCustomer.household ? (
                      <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-xl space-y-2 text-xs">
                        <p className="font-extrabold text-slate-800 flex items-center gap-1">
                          <Users className="w-4 h-4 text-slate-500" />
                          <span>{selectedCustomer.household.name}</span>
                        </p>

                        {/* List members */}
                        {householdMembers.length > 0 && (
                          <div className="space-y-1.5 border-t border-slate-200/60 pt-1.5 mt-1">
                            <span className="text-[9px] font-bold text-slate-450 uppercase block">Family Members:</span>
                            {householdMembers.map(m => {
                              const mWaLink = createWhatsAppLink(m.phone, getGeneralCustomerMessage(m.full_name, businessName))
                              return (
                                <div key={m.id} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                                  <span
                                    onClick={() => setSelectedCustomerId(m.id)}
                                    className="text-indigo-655 hover:text-indigo-800 hover:underline cursor-pointer font-bold leading-tight truncate pr-2"
                                  >
                                    {m.full_name} {m.surname}
                                  </span>
                                  {mWaLink && (
                                    <a
                                      href={mWaLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all cursor-pointer flex-shrink-0"
                                      title={`WhatsApp ${m.full_name}`}
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <button
                          onClick={handleUnlinkHousehold}
                          disabled={linkingLoading}
                          className="w-full mt-2.5 py-1 px-2 border border-red-200 text-red-650 hover:bg-red-50 hover:border-red-300 text-[10px] font-black rounded-lg flex items-center justify-center space-x-1 cursor-pointer"
                        >
                          <Unlink className="w-3 h-3" />
                          <span>Unlink Household</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {!showHouseholdLinker ? (
                          <button
                            onClick={handleOpenLinker}
                            className="w-full py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer"
                          >
                            <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span>Link Family / Group</span>
                          </button>
                        ) : (
                          <div className="p-3 border border-slate-200 bg-slate-50 rounded-xl space-y-3 text-xs">
                            {/* Existing household select */}
                            {households.length > 0 && (
                              <div>
                                <label className="text-[9px] font-bold text-slate-450 block mb-1">Select Group</label>
                                <select
                                  value={selectedHouseholdId}
                                  onChange={e => {
                                    setSelectedHouseholdId(e.target.value)
                                    setNewHouseholdName('')
                                  }}
                                  className="w-full p-1.5 border border-slate-200 bg-white rounded-lg font-semibold focus:outline-none"
                                >
                                  <option value="">-- Choose Existing --</option>
                                  {households.map(h => (
                                    <option key={h.id} value={h.id}>{h.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Or Create New */}
                            <div>
                              <label className="text-[9px] font-bold text-slate-455 block mb-1">Or Create New Group</label>
                              <input
                                type="text"
                                placeholder="e.g. Smith Household"
                                value={newHouseholdName}
                                onChange={e => {
                                  setNewHouseholdName(e.target.value)
                                  setSelectedHouseholdId('')
                                }}
                                className="w-full p-1.5 border border-slate-200 bg-white rounded-lg font-semibold focus:outline-none"
                              />
                            </div>

                            <div className="flex items-center space-x-2 pt-1.5 border-t border-slate-200">
                              <button
                                onClick={() => setShowHouseholdLinker(false)}
                                className="flex-1 py-1 border border-slate-200 rounded-lg hover:bg-slate-100 font-bold"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveHouseholdLink}
                                disabled={linkingLoading || (!selectedHouseholdId && !newHouseholdName.trim())}
                                className="flex-1 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold flex items-center justify-center space-x-1"
                              >
                                {linkingLoading ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Link</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </SectionCard>

              {/* Card 2: Pets List */}
              <SectionCard title="Linked Pets" icon={<Dog className="w-5 h-5" />}>
                {selectedCustomer.pets?.length === 0 ? (
                  <EmptyState
                    title="No Pets Registered"
                    description="No dog records are currently registered under this customer."
                    icon={<Dog className="w-8 h-8 text-slate-350" />}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedCustomer.pets.map(pet => (
                      <div key={pet.id} className="p-4 border border-slate-200 bg-slate-50/20 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <p className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                            <Dog className="w-4 h-4 text-slate-400 shrink-0" />
                            {pet.name}
                          </p>
                          <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-black rounded-full uppercase">
                            {pet.size}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-slate-600 space-y-1">
                          {pet.breed && <p>Breed: <span className="text-slate-850 font-bold">{pet.breed}</span></p>}
                          {pet.age_years !== null && pet.age_years !== undefined && (
                            <p>Age: <span className="text-slate-850 font-bold">{pet.age_years} {pet.age_years === 1 ? 'year' : 'years'}</span></p>
                          )}
                          {pet.notes && (
                            <div className="mt-2 p-2 bg-white rounded-lg border border-slate-150 text-[11px] text-slate-500 italic leading-relaxed">
                              <span className="font-bold text-slate-700 block not-italic mb-0.5 text-[9px] uppercase tracking-wider">Health/temperament Notes:</span>
                              "{pet.notes}"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Card 3: Visit Stats & Timeline */}
              {(() => {
                const stats = getBookingStats(selectedCustomer)
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Stats summary panel */}
                    <div className="lg:col-span-1 space-y-4">
                      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block border-b border-slate-100 pb-2">Groom Summary</h4>
                        
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-semibold">Total Bookings:</span>
                            <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">{stats.total}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-semibold">Completed:</span>
                            <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">{stats.completedCount}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-semibold">Upcoming Scheduled:</span>
                            <span className="font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">{stats.upcomingCount}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100">
                            <span className="text-slate-500 font-semibold">Most Demanded:</span>
                            <span className="font-bold text-slate-800 text-right max-w-[120px] truncate" title={stats.mostPopularService}>
                              {stats.mostPopularService}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bookings timelines */}
                    <div className="lg:col-span-2 space-y-4">
                      <SectionCard title="Bookings History">
                        {stats.total === 0 ? (
                          <EmptyState
                            title="No Bookings Recorded"
                            description="This customer hasn't scheduled any grooming sessions yet."
                            icon={<Calendar className="w-8 h-8 text-slate-350" />}
                          />
                        ) : (
                          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                            {/* Upcoming timeline first */}
                            {stats.upcoming.map(b => (
                              <div key={b.id} className="p-3 border border-indigo-150/40 bg-indigo-50/10 rounded-xl flex items-center justify-between text-xs font-semibold gap-3">
                                <div className="space-y-0.5">
                                  <p className="font-extrabold text-slate-850 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span>{formatLocalDate(b.start_time)} at {formatLocalTime(b.start_time)}</span>
                                  </p>
                                  <p className="text-slate-500 font-bold text-[11px]">{b.service?.name}</p>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                                    {b.source}
                                  </span>
                                  <StatusBadge status={b.status === 'confirmed' ? 'active' : 'pending'} label={b.status} />
                                </div>
                              </div>
                            ))}

                            {/* Past timeline */}
                            {stats.past.map(b => (
                              <div key={b.id} className="p-3 border border-slate-150 bg-white rounded-xl flex items-center justify-between text-xs font-semibold gap-3">
                                <div className="space-y-0.5">
                                  <p className="font-bold text-slate-700">
                                    {formatLocalDate(b.start_time)} at {formatLocalTime(b.start_time)}
                                  </p>
                                  <p className="text-slate-400 font-semibold text-[11px]">{b.service?.name}</p>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-50 border border-slate-150 px-1.5 py-0.5 rounded-md">
                                    {b.source}
                                  </span>
                                  {(() => {
                                    let status: 'success' | 'danger' | 'inactive' = 'inactive'
                                    if (b.status === 'completed') status = 'success'
                                    else if (b.status === 'cancelled') status = 'danger'
                                    return <StatusBadge status={status} label={b.status} />
                                  })()}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </SectionCard>
                    </div>

                  </div>
                )
              })()}

            </div>
          ) : (
            <div className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-400 max-w-lg mx-auto mt-12 space-y-4">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Bookmark className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-700">Select a Customer Profile</p>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-semibold max-w-xs mx-auto">
                  Click on any client on the left panel to load their registered pets, total visits, and family accounts history.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
