import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { normalizeSaPhone } from '../../lib/phone'
import {
  Search,
  User,
  Phone,
  Mail,
  Dog,
  Calendar,
  Clock,
  Loader2,
  Bookmark,
  ChevronRight,
  MessageSquare,
  Pencil,
  Plus,
  X,
  Archive
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
  updateCustomerProfile,
  addPetToCustomer,
  archivePet,
  updatePetProfile,
  mergeCustomerHouseholds,
  mergeCustomerPets,
  type CustomerHistory
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('the Parlour')
  
  // Selected Customer ID
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  // Overlay forms modals states
  const [editingCustomer, setEditingCustomer] = useState<CustomerHistory | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [editingPet, setEditingPet] = useState<any | null>(null)
  const [addingPet, setAddingPet] = useState(false)
  const [linkingLoading, setLinkingLoading] = useState(false)

  // Household & Shared Pet states
  const [managingHousehold, setManagingHousehold] = useState<CustomerHistory | null>(null)
  const [householdMembers, setHouseholdMembers] = useState<any[]>([])
  const [householdPets, setHouseholdPets] = useState<any[]>([])
  const [searchQueryLink, setSearchQueryLink] = useState('')
  const [searchResultsLink, setSearchResultsLink] = useState<CustomerHistory[]>([])
  const [selectedCustomerToLink, setSelectedCustomerToLink] = useState<CustomerHistory | null>(null)
  const [targetMembersToLink, setTargetMembersToLink] = useState<any[]>([])
  const [selectedPrimaryPet, setSelectedPrimaryPet] = useState('')
  const [selectedDuplicatePet, setSelectedDuplicatePet] = useState('')
  const [selectedCustomerHouseholdMembers, setSelectedCustomerHouseholdMembers] = useState<any[]>([])
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)


  // Local forms state (inside unified modal)
  const [customerForm, setCustomerForm] = useState({
    full_name: '',
    surname: '',
    phone: '',
    email: ''
  })

  const [addressForm, setAddressForm] = useState({
    address_line_1: '',
    address_line_2: '',
    suburb: '',
    city: '',
    province: '',
    postal_code: '',
    country: 'South Africa'
  })

  const [extraNames, setExtraNames] = useState<string[]>([])
  const [newExtraName, setNewExtraName] = useState('')

  const [petForm, setPetForm] = useState({
    name: '',
    breed: '',
    size: 'Medium',
    notes: '',
    age_years: '' as string | number,
    species: 'dog'
  })

  // Derived state
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null
  const activePets = selectedCustomer?.pets?.filter(p => p.is_active) || []

  const loadCustomers = async (bid: string, search: string) => {
    try {
      setLoading(true)
      setError(null)
      const data = await searchCustomers(bid, search)
      setCustomers(data)
      
      // If there's an active selected customer, keep it; otherwise default select first
      if (data.length > 0) {
        if (selectedCustomerId) {
          const stillExists = data.some(c => c.id === selectedCustomerId)
          if (!stillExists) {
            setSelectedCustomerId(data[0].id)
          }
        } else {
          setSelectedCustomerId(data[0].id)
        }
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

  const loadHouseholdData = async (householdId: string | null, customerId: string) => {
    if (!householdId) {
      const currentCust = customers.find(c => c.id === customerId)
      setHouseholdMembers(currentCust ? [currentCust] : [])
      setHouseholdPets(currentCust?.pets?.filter(p => p.is_active) || [])
      return
    }
    try {
      const { data: members, error: memErr } = await supabase
        .from('customers')
        .select('id, full_name, surname, phone, household_id')
        .eq('household_id', householdId)
        .eq('business_id', profile?.business_id)

      if (memErr) throw memErr
      setHouseholdMembers(members || [])

      const { data: pets, error: petErr } = await supabase
        .from('pets')
        .select('id, name, breed, size, species, is_active, customer_id, household_id')
        .eq('household_id', householdId)
        .eq('is_active', true)
        .eq('business_id', profile?.business_id)

      if (petErr) throw petErr
      setHouseholdPets(pets || [])
    } catch (err) {
      console.error('Error loading household data:', err)
    }
  }

  useEffect(() => {
    if (managingHousehold) {
      loadHouseholdData(managingHousehold.household_id, managingHousehold.id)
    }
  }, [managingHousehold, customers])

  useEffect(() => {
    if (selectedCustomer && selectedCustomer.household_id) {
      supabase
        .from('customers')
        .select('id, full_name, surname, phone')
        .eq('household_id', selectedCustomer.household_id)
        .eq('business_id', profile?.business_id)
        .then(({ data }) => {
          setSelectedCustomerHouseholdMembers(data || [])
        })
    } else {
      setSelectedCustomerHouseholdMembers([])
    }
  }, [selectedCustomerId, selectedCustomer?.household_id, profile])

  const handleLinkSearch = async (query: string) => {
    setSearchQueryLink(query)
    if (query.trim().length < 2) {
      setSearchResultsLink([])
      return
    }
    try {
      const data = await searchCustomers(profile?.business_id || '', query)
      const filtered = data.filter(c => c.id !== selectedCustomerId && (!selectedCustomer?.household_id || c.household_id !== selectedCustomer?.household_id))
      setSearchResultsLink(filtered)
    } catch (err) {
      console.error('Error searching customers to link:', err)
    }
  }

  const handleSelectCustomerToLink = async (cust: CustomerHistory) => {
    setSelectedCustomerToLink(cust)
    if (cust.household_id) {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name, surname')
          .eq('household_id', cust.household_id)
          .neq('id', cust.id)
        if (error) throw error
        setTargetMembersToLink(data || [])
      } catch (err) {
        console.error(err)
        setTargetMembersToLink([])
      }
    } else {
      setTargetMembersToLink([])
    }
  }

  const handleLinkCustomerSubmit = async () => {
    if (!selectedCustomer || !selectedCustomerToLink) return
    try {
      setLinkingLoading(true)
      setModalError(null)
      setModalSuccess(null)
      const res = await mergeCustomerHouseholds(selectedCustomer.id, selectedCustomerToLink.id)
      if (!res.success) {
        setModalError(res.error || 'Could not link household. Please try again.')
        return
      }
      
      const bid = profile?.business_id
      if (bid) {
        const data = await searchCustomers(bid, searchQuery)
        setCustomers(data)
        const updated = data.find(c => c.id === selectedCustomer?.id)
        if (updated) {
          setManagingHousehold(updated)
        }
      }
      
      setSelectedCustomerToLink(null)
      setTargetMembersToLink([])
      setSearchQueryLink('')
      setSearchResultsLink([])
      
      setModalSuccess('Household linked successfully.')
      setTimeout(() => {
        setModalSuccess(null)
      }, 4000)
    } catch (err: any) {
      console.error(err)
      setModalError(err.message || 'Could not link household. Please try again.')
    } finally {
      setLinkingLoading(false)
    }
  }

  const handleMergePetsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPrimaryPet || !selectedDuplicatePet) return

    const confirmed = window.confirm(
      'Bookings for the duplicate pet will move to the selected pet. The original customer on each booking will stay unchanged.'
    )
    if (!confirmed) return

    try {
      setLinkingLoading(true)
      setModalError(null)
      setModalSuccess(null)
      const res = await mergeCustomerPets(selectedPrimaryPet, [selectedDuplicatePet])
      if (!res.success) {
        setModalError(res.error || 'Could not link pet records. Please try again.')
        return
      }

      setModalSuccess('Pet records linked successfully.')
      setTimeout(() => {
        setModalSuccess(null)
      }, 4000)
      
      const bid = profile?.business_id
      if (bid) {
        const data = await searchCustomers(bid, searchQuery)
        setCustomers(data)
        const updated = data.find(c => c.id === selectedCustomer?.id)
        if (updated) {
          setManagingHousehold(updated)
        }
      }
      
      setSelectedPrimaryPet('')
      setSelectedDuplicatePet('')
    } catch (err: any) {
      console.error(err)
      setModalError(err.message || 'Could not link pet records. Please try again.')
    } finally {
      setLinkingLoading(false)
    }
  }


  // Trigger search
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const bid = profile?.business_id
    if (!bid) return
    loadCustomers(bid, searchQuery)
  }

  // Pre-populate forms
  useEffect(() => {
    if (editingCustomer) {
      setModalError(null)
      setCustomerForm({
        full_name: editingCustomer.full_name || '',
        surname: editingCustomer.surname || '',
        phone: editingCustomer.phone || '',
        email: editingCustomer.email || ''
      })
      
      const hh = editingCustomer.household
      setAddressForm({
        address_line_1: hh?.address_line_1 || '',
        address_line_2: hh?.address_line_2 || '',
        suburb: hh?.suburb || '',
        city: hh?.city || '',
        province: hh?.province || '',
        postal_code: hh?.postal_code || '',
        country: hh?.country || 'South Africa'
      })
      
      setExtraNames(hh?.household_member_names || [])
      setNewExtraName('')
    }
  }, [editingCustomer])

  useEffect(() => {
    if (editingPet) {
      setPetForm({
        name: editingPet.name || '',
        breed: editingPet.breed || '',
        size: editingPet.size || 'Medium',
        notes: editingPet.notes || '',
        age_years: editingPet.age_years !== null && editingPet.age_years !== undefined ? editingPet.age_years : '',
        species: editingPet.species || 'dog'
      })
    }
  }, [editingPet])

  // Save changes from Edit Profile Modal
  const handleEditProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const bid = profile?.business_id
    if (!bid || !editingCustomer) return
    try {
      setLinkingLoading(true)
      setModalError(null)
      setError(null)
      setSuccessMsg(null)
      
      await updateCustomerProfile(
        bid,
        editingCustomer.id,
        editingCustomer.household_id,
        customerForm,
        {
          ...addressForm,
          household_member_names: extraNames
        }
      )
      
      setSuccessMsg('Customer profile details successfully updated.')
      setEditingCustomer(null)
      await loadCustomers(bid, searchQuery)
    } catch (err: any) {
      console.error('Error updating customer profile:', err)
      setModalError(err.message || 'Failed to update customer details.')
    } finally {
      setLinkingLoading(false)
    }
  }

  // Edit Extra Names list controls inside the modal
  const addExtraName = () => {
    const trimmed = newExtraName.trim()
    if (trimmed && !extraNames.includes(trimmed)) {
      setExtraNames(prev => [...prev, trimmed])
      setNewExtraName('')
    }
  }

  const handleAddExtraName = (e: React.MouseEvent) => {
    e.preventDefault()
    addExtraName()
  }

  const handleExtraNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addExtraName()
    }
  }

  const handleRemoveExtraName = (e: React.MouseEvent, nameToRemove: string) => {
    e.preventDefault()
    setExtraNames(prev => prev.filter(n => n !== nameToRemove))
  }

  // Add Pet
  const handleAddPetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const bid = profile?.business_id
    if (!bid || !selectedCustomer) return
    try {
      setLinkingLoading(true)
      setError(null)
      setSuccessMsg(null)
      const ageNum = petForm.age_years === '' ? null : Number(petForm.age_years)

      const res = await addPetToCustomer(bid, selectedCustomer.id, selectedCustomer.household_id, {
        name: petForm.name,
        species: petForm.species,
        breed: petForm.breed || null,
        size: petForm.size || null,
        age_years: ageNum,
        notes: petForm.notes || null
      })

      if (!res.success) {
        setError(res.error || 'Failed to add pet.')
        return
      }

      setSuccessMsg(`Successfully registered pet "${petForm.name}" under this customer profile.`)
      setAddingPet(false)
      setPetForm({ name: '', breed: '', size: 'Medium', notes: '', age_years: '', species: 'dog' })
      await loadCustomers(bid, searchQuery)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to add pet profile.')
    } finally {
      setLinkingLoading(false)
    }
  }

  // Archive Pet
  const handleArchivePetClick = async (pet: any) => {
    const confirmed = window.confirm(`Archive Pet: This will hide the pet from the active profile but keep booking history. Are you sure you want to archive "${pet.name}"?`)
    if (!confirmed) return
    const bid = profile?.business_id
    if (!bid) return
    try {
      setLinkingLoading(true)
      setError(null)
      setSuccessMsg(null)
      await archivePet(bid, pet.id)
      setSuccessMsg(`Successfully archived pet "${pet.name}".`)
      await loadCustomers(bid, searchQuery)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to archive pet.')
    } finally {
      setLinkingLoading(false)
    }
  }

  // Update Pet
  const handleUpdatePetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const bid = profile?.business_id
    if (!bid || !editingPet) return
    try {
      setLinkingLoading(true)
      setError(null)
      setSuccessMsg(null)
      const ageNum = petForm.age_years === '' ? null : Number(petForm.age_years)
      await updatePetProfile(bid, editingPet.id, {
        name: petForm.name,
        breed: petForm.breed || null,
        size: petForm.size || null,
        notes: petForm.notes || null,
        age_years: ageNum,
        species: petForm.species
      })
      setSuccessMsg(`Pet details for "${petForm.name}" successfully updated.`)
      setEditingPet(null)
      await loadCustomers(bid, searchQuery)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to update pet profile.')
    } finally {
      setLinkingLoading(false)
    }
  }

  // Summary visit stats
  const getBookingStats = (cust: CustomerHistory) => {
    const all = cust.bookings || []
    const completed = all.filter(b => b.status === 'completed')
    const pending = all.filter(b => b.status === 'pending')
    
    const sorted = [...all].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const past = sorted.filter(b => new Date(b.start_time) < new Date())
    const upcoming = sorted.filter(b => new Date(b.start_time) >= new Date() && (b.status === 'confirmed' || b.status === 'pending'))

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
      past: [...past].reverse()
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn text-slate-800">
      {/* Header */}
      <PageHeader
        title="Customer & Pet History"
        description="Search client profiles, review complete groom timelines, and manage profile records."
      />

      {error && <AlertMessage type="error" message={error} />}
      {successMsg && <AlertMessage type="success" message={successMsg} />}

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
                icon={<User className="w-8 h-8 text-slate-330" />}
              />
            ) : (
              <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto pr-1">
                {customers.map((c) => {
                  const stats = getBookingStats(c)
                  const isSelected = c.id === selectedCustomerId
                  const waLink = createWhatsAppLink(c.phone, getGeneralCustomerMessage(c.full_name, businessName))
                  const isProfileIncomplete = !c.household?.address_line_1
                  const isNewCustomer = Math.abs(new Date(c.created_at).getTime() - new Date().getTime()) < 7 * 24 * 60 * 60 * 1000

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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`font-extrabold text-sm truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                            {c.full_name} {c.surname}
                          </p>
                          {isNewCustomer && (
                            <span className="px-1.5 py-0.2 bg-emerald-50 border border-emerald-250 text-emerald-800 text-[8px] font-black rounded-full uppercase">New</span>
                          )}
                          {isProfileIncomplete && (
                            <span className="px-1.5 py-0.2 bg-amber-50 border border-amber-250 text-amber-800 text-[8px] font-black rounded-full uppercase">Incomplete</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-500 font-semibold text-xs flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{c.phone}</span>
                          </p>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          {c.pets?.filter(p => p.is_active).length || 0} {c.pets?.filter(p => p.is_active).length === 1 ? 'dog' : 'dogs'} 
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

        {/* Right Column: Customer Details */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <div className="space-y-6">
              
              {/* Card 1: Core Customer Info */}
              <SectionCard 
                title="Customer Profile" 
                icon={<User className="w-5 h-5" />}
                headerAction={
                  <div className="flex items-center gap-2">
                    {!selectedCustomer.household?.address_line_1 && (
                      <span className="px-2 py-0.5 bg-amber-50 border border-amber-250 text-amber-800 text-[10px] font-black rounded-full uppercase tracking-wider shrink-0">
                        Address needed
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setModalError(null)
                        setSelectedCustomerToLink(null)
                        setTargetMembersToLink([])
                        setSearchQueryLink('')
                        setSearchResultsLink([])
                        setSelectedPrimaryPet('')
                        setSelectedDuplicatePet('')
                        setManagingHousehold(selectedCustomer)
                      }}
                      className="flex items-center space-x-1.5 py-1 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer border border-slate-200"
                    >
                      <span>Manage household</span>
                    </button>
                    <button
                      onClick={() => setEditingCustomer(selectedCustomer)}
                      className="flex items-center space-x-1.5 py-1 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-all cursor-pointer border border-indigo-150"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit Profile</span>
                    </button>
                  </div>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Contact details */}
                  <div className="md:col-span-2 space-y-4 border-r border-slate-100 pr-0 md:pr-6">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-lg">
                        {selectedCustomer.full_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900 leading-tight">
                          {selectedCustomer.full_name} {selectedCustomer.surname || ''}
                        </h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                          ID: {selectedCustomer.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold text-slate-655 pt-1">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Phone Number</span>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 font-bold text-slate-800">
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
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Email Address</span>
                        <p className="flex items-center gap-1.5 truncate text-slate-800">
                          <Mail className="w-4 h-4 text-slate-400" />
                          <span className="truncate">{selectedCustomer.email || '—'}</span>
                        </p>
                      </div>

                      <div className="space-y-1 col-span-2 pt-1 border-t border-slate-100/60">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Date Registered</span>
                        <p className="flex items-center gap-1.5 text-slate-650 font-bold">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span>{formatLocalDate(selectedCustomer.created_at)}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Address & Other Names Section */}
                  <div className="md:col-span-1 space-y-4">
                    
                    {/* Address panel */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Address</span>
                      <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl text-xs">
                        {selectedCustomer.household?.address_line_1 ? (
                          <div className="space-y-0.5 font-bold text-slate-700">
                            <p>{selectedCustomer.household.address_line_1}</p>
                            {selectedCustomer.household.address_line_2 && <p>{selectedCustomer.household.address_line_2}</p>}
                            <p className="font-semibold text-slate-500">
                              {selectedCustomer.household.suburb && `${selectedCustomer.household.suburb}, `}{selectedCustomer.household.city}
                            </p>
                            <p className="font-semibold text-slate-500">
                              {selectedCustomer.household.province && `${selectedCustomer.household.province}, `}{selectedCustomer.household.postal_code}
                            </p>
                            <p className="font-semibold text-slate-400">{selectedCustomer.household.country}</p>
                          </div>
                        ) : (
                          <p className="text-slate-550 font-bold text-slate-600">—</p>
                        )}
                      </div>
                    </div>

                    {/* Other names on this profile */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Other names on this profile</span>
                      <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl text-xs">
                        {selectedCustomer.household?.household_member_names && selectedCustomer.household.household_member_names.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedCustomer.household.household_member_names.map((name, index) => (
                              <span 
                                key={index} 
                                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold text-[11px]"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-550 font-bold text-slate-600">—</p>
                        )}
                      </div>
                    </div>

                    {/* Linked Household Members */}
                    {selectedCustomer.household_id && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Linked Household Members</span>
                        <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl text-xs space-y-1.5">
                          {selectedCustomerHouseholdMembers.length > 1 ? (
                            <div className="space-y-1">
                              {selectedCustomerHouseholdMembers
                                .filter(m => m.id !== selectedCustomer.id)
                                .map(m => (
                                  <div key={m.id} className="font-bold text-slate-700">
                                    {m.full_name} {m.surname || ''} <span className="font-normal text-slate-450">({m.phone})</span>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <p className="text-slate-500 font-bold">No other customer profiles linked.</p>
                          )}
                        </div>
                      </div>
                    )}

                  </div>

                </div>
              </SectionCard>

              {/* Card 2: Pets List */}
              <SectionCard 
                title="Pets" 
                icon={<Dog className="w-5 h-5" />}
                headerAction={
                  <button
                    onClick={() => {
                      setPetForm({ name: '', breed: '', size: 'Medium', notes: '', age_years: '', species: 'dog' })
                      setAddingPet(true)
                    }}
                    className="flex items-center space-x-1.5 py-1 px-3 bg-indigo-55 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-all cursor-pointer border border-indigo-150"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Pet</span>
                  </button>
                }
              >
                {activePets.length === 0 ? (
                  <EmptyState
                    title="No Pets Registered"
                    description="No pet profiles are registered under this customer."
                    icon={<Dog className="w-8 h-8 text-slate-350" />}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activePets.map((pet: any) => (
                      <div key={pet.id} className="p-4 border border-slate-200 bg-slate-50/25 rounded-2xl space-y-2 group relative">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <p className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                            <Dog className="w-4 h-4 text-slate-400 shrink-0" />
                            {pet.name}
                            <span className="text-[10px] text-slate-450 font-bold bg-slate-100 border border-slate-200/60 px-1.5 py-0.1 rounded-md capitalize shrink-0 ml-1">
                              {pet.species || 'dog'}
                            </span>
                          </p>
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => setEditingPet(pet)}
                              className="p-1 text-slate-400 hover:text-indigo-650 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="Edit Pet Details"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleArchivePetClick(pet)}
                              className="p-1 text-slate-450 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              title="Archive Pet"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-black rounded-full uppercase">
                              {pet.size || 'Medium'}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs font-semibold text-slate-650 space-y-1">
                          {pet.breed && <p>Breed: <span className="text-slate-850 font-bold">{pet.breed}</span></p>}
                          {pet.age_years !== null && pet.age_years !== undefined && (
                            <p>Age: <span className="text-slate-850 font-bold">{pet.age_years} {pet.age_years === 1 ? 'year' : 'years'}</span></p>
                          )}
                          {pet.notes && (
                            <div className="mt-2 p-2 bg-white rounded-lg border border-slate-150 text-[11px] text-slate-500 italic leading-relaxed">
                              <span className="font-bold text-slate-700 block not-italic mb-0.5 text-[9px] uppercase tracking-wider font-semibold">Grooming & Temperament Notes:</span>
                              "{pet.notes}"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Card 3: Booking History */}
              {(() => {
                const stats = getBookingStats(selectedCustomer)
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Stats summary */}
                    <div className="lg:col-span-1 space-y-4">
                      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block border-b border-slate-100 pb-2">Groom Summary</h4>
                        
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-700 font-semibold">Total Bookings:</span>
                            <span className="font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">{stats.total}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-700 font-semibold">Completed:</span>
                            <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">{stats.completedCount}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-700 font-semibold">Upcoming Scheduled:</span>
                            <span className="font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">{stats.upcomingCount}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100">
                            <span className="text-slate-700 font-semibold">Most Demanded:</span>
                            <span className="font-bold text-slate-800 text-right max-w-[120px] truncate" title={stats.mostPopularService}>
                              {stats.mostPopularService}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="lg:col-span-2 space-y-4">
                      <SectionCard title="Booking History">
                        {stats.total === 0 ? (
                          <EmptyState
                            title="No Bookings Recorded"
                            description="This customer hasn't scheduled any grooming sessions yet."
                            icon={<Calendar className="w-8 h-8 text-slate-350" />}
                          />
                        ) : (
                          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
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
                                  {(() => {
                                    const status = b.status
                                    const labels: Record<string, string> = {
                                      pending: 'Awaiting approval',
                                      confirmed: 'Confirmed',
                                      arrived: 'Checkout pending',
                                      completed: 'Completed',
                                      cancelled: 'Cancelled',
                                      declined: 'Declined',
                                      no_show: 'No-show'
                                    }
                                    const label = labels[status] || status
                                    return <StatusBadge status={status as any} label={label} />
                                  })()}
                                </div>
                              </div>
                            ))}

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
                                    const status = b.status
                                    const labels: Record<string, string> = {
                                      pending: 'Awaiting approval',
                                      confirmed: 'Confirmed',
                                      arrived: 'Checkout pending',
                                      completed: 'Completed',
                                      cancelled: 'Cancelled',
                                      declined: 'Declined',
                                      no_show: 'No-show'
                                    }
                                    const label = labels[status] || status
                                    return <StatusBadge status={status as any} label={label} />
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
                  Click on any client on the left panel to load their registered pets and booking history.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 1. Unified Modal: Edit Profile & Address */}
      {/* ========================================================================= */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Edit Customer Profile & Address</h3>
              <button 
                onClick={() => setEditingCustomer(null)} 
                className="text-slate-400 hover:text-slate-650 p-1.5 hover:bg-slate-50 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {modalError && <AlertMessage type="error" message={modalError} />}
            
            <form onSubmit={handleEditProfileSubmit} className="space-y-4 text-xs font-semibold max-h-[75vh] overflow-y-auto pr-1">
              
              {/* A. Bio Details */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-black text-indigo-650 uppercase tracking-wider block border-b border-slate-100 pb-1">Personal Details</span>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-700 uppercase">First Name</label>
                    <input
                      type="text"
                      required
                      value={customerForm.full_name}
                      onChange={e => setCustomerForm(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-700 uppercase">Surname</label>
                    <input
                      type="text"
                      value={customerForm.surname}
                      onChange={e => setCustomerForm(prev => ({ ...prev, surname: e.target.value }))}
                      className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-700 uppercase">Phone Number</label>
                    <input
                      type="text"
                      required
                      value={customerForm.phone}
                      onChange={e => setCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                      className={`w-full p-2.5 border bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 ${
                        customerForm.phone && !normalizeSaPhone(customerForm.phone) ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200'
                      }`}
                    />
                    {customerForm.phone && !normalizeSaPhone(customerForm.phone) && (
                      <p className="text-red-655 text-[10px] mt-0.5 font-bold">Please enter a valid phone number (e.g. 082 123 4567)</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-700 uppercase">Email Address</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={e => setCustomerForm(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* B. Address Details */}
              <div className="space-y-2.5 pt-2">
                <span className="text-[10px] font-black text-indigo-655 uppercase tracking-wider block border-b border-slate-100 pb-1">Address Details</span>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">Address Line 1</label>
                  <input
                    type="text"
                    value={addressForm.address_line_1}
                    onChange={e => setAddressForm(prev => ({ ...prev, address_line_1: e.target.value }))}
                    placeholder="Street name and number"
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">Address Line 2 (Optional)</label>
                  <input
                    type="text"
                    value={addressForm.address_line_2}
                    onChange={e => setAddressForm(prev => ({ ...prev, address_line_2: e.target.value }))}
                    placeholder="Complex unit, apartment number, etc."
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-700 uppercase">Suburb</label>
                    <input
                      type="text"
                      value={addressForm.suburb}
                      onChange={e => setAddressForm(prev => ({ ...prev, suburb: e.target.value }))}
                      className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-700 uppercase">City</label>
                    <input
                      type="text"
                      value={addressForm.city}
                      onChange={e => setAddressForm(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-700 uppercase">Province</label>
                    <input
                      type="text"
                      value={addressForm.province}
                      onChange={e => setAddressForm(prev => ({ ...prev, province: e.target.value }))}
                      className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-700 uppercase">Postal Code</label>
                    <input
                      type="text"
                      value={addressForm.postal_code}
                      onChange={e => setAddressForm(prev => ({ ...prev, postal_code: e.target.value }))}
                      className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">Country</label>
                  <input
                    type="text"
                    required
                    value={addressForm.country}
                    onChange={e => setAddressForm(prev => ({ ...prev, country: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
              </div>

              {/* C. Other names on profile */}
              <div className="space-y-2.5 pt-2">
                <span className="text-[10px] font-black text-indigo-650 uppercase tracking-wider block border-b border-slate-100 pb-1">
                  Other Names on this profile
                </span>
                
                {extraNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 bg-slate-50 p-3 border border-slate-150 rounded-xl">
                    {extraNames.map((name, index) => (
                      <span 
                        key={index}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-850 font-bold"
                      >
                        <span>{name}</span>
                        <button 
                          type="button" 
                          onClick={(e) => handleRemoveExtraName(e, name)}
                          className="text-slate-400 hover:text-red-650 p-0.5 rounded-md cursor-pointer transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newExtraName}
                    onChange={e => setNewExtraName(e.target.value)}
                    onKeyDown={handleExtraNameKeyDown}
                    placeholder="Add family member name, e.g. Andrea"
                    className="flex-grow p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleAddExtraName}
                    className="px-4 py-2 border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 font-bold rounded-xl flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="flex-1 py-2 border border-slate-250 hover:bg-slate-50 text-slate-655 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linkingLoading || (!!customerForm.phone && !normalizeSaPhone(customerForm.phone))}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {linkingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Save Changes</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Modal: Add Pet Profile */}
      {/* ========================================================================= */}
      {addingPet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Add New Pet</h3>
              <button 
                onClick={() => setAddingPet(false)} 
                className="text-slate-400 hover:text-slate-650 p-1.5 hover:bg-slate-50 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddPetSubmit} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">Pet Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Max"
                    value={petForm.name}
                    onChange={e => setPetForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">Species *</label>
                  <select
                    value={petForm.species}
                    onChange={e => setPetForm(prev => ({ ...prev, species: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  >
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">Breed</label>
                  <input
                    type="text"
                    value={petForm.breed}
                    onChange={e => setPetForm(prev => ({ ...prev, breed: e.target.value }))}
                    placeholder="e.g. Jack Russell"
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">Size</label>
                  <select
                    value={petForm.size}
                    onChange={e => setPetForm(prev => ({ ...prev, size: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  >
                    <option value="Small">Small</option>
                    <option value="Medium">Medium</option>
                    <option value="Large">Large</option>
                    <option value="Giant">Giant</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-700 uppercase">Age (Years)</label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  value={petForm.age_years}
                  onChange={e => setPetForm(prev => ({ ...prev, age_years: e.target.value }))}
                  className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-700 uppercase">Grooming & Temperament Notes</label>
                <textarea
                  value={petForm.notes}
                  onChange={e => setPetForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Nervous around water, skin issues..."
                  rows={3}
                  className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 font-medium text-xs resize-none"
                />
              </div>
              <div className="flex items-center space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddingPet(false)}
                  className="flex-1 py-2 border border-slate-250 hover:bg-slate-50 text-slate-655 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linkingLoading}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  {linkingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Register Pet</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. Modal: Edit Pet Profile */}
      {/* ========================================================================= */}
      {editingPet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Edit Pet Profile</h3>
              <button 
                onClick={() => setEditingPet(null)} 
                className="text-slate-400 hover:text-slate-650 p-1.5 hover:bg-slate-50 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdatePetSubmit} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Pet Name</label>
                  <input
                    type="text"
                    required
                    value={petForm.name}
                    onChange={e => setPetForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Species</label>
                  <select
                    value={petForm.species}
                    onChange={e => setPetForm(prev => ({ ...prev, species: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  >
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Breed</label>
                  <input
                    type="text"
                    value={petForm.breed}
                    onChange={e => setPetForm(prev => ({ ...prev, breed: e.target.value }))}
                    placeholder="e.g. Yorkie"
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Size</label>
                  <select
                    value={petForm.size}
                    onChange={e => setPetForm(prev => ({ ...prev, size: e.target.value }))}
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                  >
                    <option value="Small">Small</option>
                    <option value="Medium">Medium</option>
                    <option value="Large">Large</option>
                    <option value="Giant">Giant</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Age (Years)</label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  value={petForm.age_years}
                  onChange={e => setPetForm(prev => ({ ...prev, age_years: e.target.value }))}
                  className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Grooming & Temperament Notes</label>
                <textarea
                  value={petForm.notes}
                  onChange={e => setPetForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Scared of dryers, skin allergies..."
                  rows={3}
                  className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 font-medium text-xs resize-none"
                />
              </div>
              <div className="flex items-center space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPet(null)}
                  className="flex-1 py-2 border border-slate-250 hover:bg-slate-50 text-slate-655 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linkingLoading}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  {linkingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Save Pet Profile</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. Modal: Manage Household */}
      {/* ========================================================================= */}
      {managingHousehold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Manage household</h3>
              <button 
                onClick={() => setManagingHousehold(null)} 
                className="text-slate-400 hover:text-slate-650 p-1.5 hover:bg-slate-50 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalSuccess && <AlertMessage type="success" message={modalSuccess} />}
            {modalError && <AlertMessage type="error" message={modalError} />}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto pr-1">
              
              {/* Left Column: Current Members & Link Customer */}
              <div className="space-y-4">
                {/* Household Members */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-indigo-650 uppercase tracking-wider block border-b border-slate-100 pb-1">
                    Household Members
                  </span>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {householdMembers.map(m => (
                      <div key={m.id} className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-semibold">
                        <div>
                          <p className="font-extrabold text-slate-850">
                            {m.full_name} {m.surname || ''}
                            {m.id === managingHousehold.id && (
                              <span className="ml-1.5 px-2 py-0.5 bg-indigo-50 border border-indigo-150 text-indigo-700 text-[9px] font-black rounded-md uppercase">
                                Active
                              </span>
                            )}
                          </p>
                          <p className="text-slate-550 font-normal text-[10px] mt-0.5">{m.phone}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Link Customer Search */}
                <div className="space-y-2 pt-2">
                  <span className="text-[10px] font-black text-indigo-650 uppercase tracking-wider block border-b border-slate-100 pb-1">
                    Link customer
                  </span>
                  
                  {!selectedCustomerToLink ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                          <Search className="w-3.5 h-3.5" />
                        </span>
                        <input
                          type="text"
                          placeholder="Search customer to link by name..."
                          value={searchQueryLink}
                          onChange={e => handleLinkSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold text-slate-800 bg-white"
                        />
                      </div>
                      
                      {searchResultsLink.length > 0 && (
                        <div className="border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 max-h-[140px] overflow-y-auto shadow-sm">
                          {searchResultsLink.map(c => (
                            <div
                              key={c.id}
                              onClick={() => handleSelectCustomerToLink(c)}
                              className="p-2.5 hover:bg-slate-50 cursor-pointer text-xs font-semibold flex items-center justify-between"
                            >
                              <div>
                                <p className="text-slate-800">{c.full_name} {c.surname || ''}</p>
                                <p className="text-slate-400 text-[10px]">{c.phone}</p>
                              </div>
                              <ChevronRight className="w-3 h-3 text-slate-300" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 border border-indigo-155 bg-indigo-50/10 rounded-xl space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-black text-slate-800">
                            Selected: {selectedCustomerToLink.full_name} {selectedCustomerToLink.surname || ''}
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold">{selectedCustomerToLink.phone}</p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedCustomerToLink(null)
                            setTargetMembersToLink([])
                          }}
                          className="text-slate-400 hover:text-slate-650 p-1 hover:bg-slate-100 rounded-lg cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="p-3 bg-amber-50/40 border border-amber-200 rounded-lg text-[11px] leading-relaxed text-amber-900 font-semibold">
                        {targetMembersToLink.length > 0 ? (
                          <span>
                            This will link the entire selected household, including{' '}
                            <strong>
                              {targetMembersToLink
                                .map(m => `${m.full_name} ${m.surname || ''}`.trim())
                                .join(', ')}
                            </strong>
                            , under this household. Their customer profiles and booking history will remain separate.
                          </span>
                        ) : (
                          <span>
                            This will link both customers under one household. Their bookings and contact details will remain separate.
                          </span>
                        )}
                      </div>

                      <button
                        onClick={handleLinkCustomerSubmit}
                        disabled={linkingLoading}
                        className="w-full py-2 bg-indigo-605 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {linkingLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Linking...</span>
                          </>
                        ) : (
                          <span>Link household</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Shared Pets & Mark as Same Pet */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                
                {/* Shared Pets list */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-indigo-650 uppercase tracking-wider block border-b border-slate-100 pb-1">
                    Shared pets
                  </span>
                  
                  {householdPets.length === 0 ? (
                    <div className="text-slate-500 text-xs italic py-2">
                      No active pets in this household.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                      {householdPets.map(p => (
                        <div key={p.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs font-semibold">
                          <div className="min-w-0">
                            <p className="font-extrabold text-slate-850 truncate flex items-center gap-1">
                              <Dog className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{p.name}</span>
                              <span className="text-[9px] text-slate-450 font-normal bg-slate-100 px-1 py-0.1 rounded-md capitalize shrink-0 ml-1">
                                {p.species}
                              </span>
                            </p>
                            <p className="text-slate-450 text-[10px] font-normal truncate">
                              Breed: {p.breed || 'Unknown'} • Size: {p.size || 'Medium'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mark as Same Pet consolidation form */}
                {householdPets.length > 1 && (
                  <div className="bg-slate-50/50 p-4 border border-slate-150 rounded-2xl space-y-3 pt-3">
                    <h4 className="font-extrabold text-slate-855 text-xs flex items-center gap-1.5">
                      <Dog className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Consolidate duplicates</span>
                    </h4>
                    
                    <form onSubmit={handleMergePetsSubmit} className="space-y-3 text-xs font-semibold">
                      <div className="space-y-2.5">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-600 uppercase">Primary pet (Keep)</label>
                          <select
                            value={selectedPrimaryPet}
                            onChange={e => setSelectedPrimaryPet(e.target.value)}
                            className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                          >
                            <option value="">Select primary pet...</option>
                            {householdPets.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.breed || 'Unknown breed'})
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-600 uppercase">Duplicate pet (Merge)</label>
                          <select
                            value={selectedDuplicatePet}
                            onChange={e => setSelectedDuplicatePet(e.target.value)}
                            disabled={!selectedPrimaryPet}
                            className="w-full p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 disabled:opacity-50"
                          >
                            <option value="">Select duplicate pet...</option>
                            {householdPets
                              .filter(p => p.id !== selectedPrimaryPet)
                              .map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.breed || 'Unknown breed'})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={!selectedPrimaryPet || !selectedDuplicatePet || linkingLoading}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {linkingLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Marking...</span>
                          </>
                        ) : (
                          <span>Mark as same pet</span>
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </div>

            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setManagingHousehold(null)}
                className="px-6 py-2 border border-slate-250 hover:bg-slate-50 text-slate-655 font-bold rounded-xl cursor-pointer text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

