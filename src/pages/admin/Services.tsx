import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Scissors,
  ChevronLeft,
  Clock,
  Plus,
  Pencil,
  Power,
  Info,
  ArrowUpDown
} from 'lucide-react'
import { PageHeader, SectionCard, FormField, AlertMessage, LoadingState, StatusBadge } from '../../components/UI'
import {
  fetchServices,
  createService,
  updateService,
  type Service,
} from '../../services/serviceService'

const DOG_SIZES = [
  { value: 'all', label: 'All Sizes' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

export default function Services() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()

  // State
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    dog_size: 'all',
    duration_minutes: 60,
    price_rand: '',
    is_active: true,
    sort_order: 0,
  })

  // Load services
  const loadServices = async (businessId: string) => {
    try {
      setLoading(true)
      const data = await fetchServices(businessId)
      setServices(data)
    } catch (err: any) {
      console.error('Error fetching services:', err)
      setError(err.message || 'Failed to load services.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return

    if (!profile || !profile.business_id) {
      setError('You are not associated with a business profile.')
      setLoading(false)
      return
    }

    loadServices(profile.business_id)
  }, [profile, authLoading])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: checked }))
  }

  const resetForm = () => {
    setEditingId(null)
    setForm({
      name: '',
      description: '',
      dog_size: 'all',
      duration_minutes: 60,
      price_rand: '',
      is_active: true,
      sort_order: services.length * 10, // Suggest next sort order logically
    })
  }

  const handleEditClick = (service: Service) => {
    setEditingId(service.id)
    setForm({
      name: service.name,
      description: service.description || '',
      dog_size: service.dog_size || 'all',
      duration_minutes: service.duration_minutes,
      price_rand: (service.price_cents / 100).toFixed(2),
      is_active: service.is_active,
      sort_order: service.sort_order,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Quickly toggle active state from the list directly
  const handleToggleActive = async (service: Service) => {
    if (!profile?.business_id) return
    setError(null)
    setSuccess(null)

    try {
      const nextActiveState = !service.is_active
      await updateService(profile.business_id, service.id, {
        is_active: nextActiveState,
      })

      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, is_active: nextActiveState } : s))
      )
      setSuccess(`Service "${service.name}" ${nextActiveState ? 'activated' : 'deactivated'} successfully.`)
    } catch (err: any) {
      console.error('Error toggling service status:', err)
      setError(err.message || 'Failed to update service status.')
    }
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile?.business_id) return

    setError(null)
    setSuccess(null)
    setSubmitting(true)

    // Validations
    if (!form.name.trim()) {
      setError('Service Name is required.')
      setSubmitting(false)
      return
    }

    const duration = Number(form.duration_minutes)
    if (isNaN(duration) || duration <= 0) {
      setError('Duration must be greater than 0 minutes.')
      setSubmitting(false)
      return
    }

    const priceRandNum = Number(form.price_rand)
    if (isNaN(priceRandNum) || priceRandNum < 0) {
      setError('Price cannot be negative.')
      setSubmitting(false)
      return
    }

    const priceCents = Math.round(priceRandNum * 100)

    try {
      const servicePayload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        dog_size: form.dog_size || null,
        duration_minutes: duration,
        price_cents: priceCents,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
      }

      if (editingId) {
        await updateService(profile.business_id, editingId, servicePayload)
        setSuccess(`Service "${form.name}" updated successfully.`)
      } else {
        await createService(profile.business_id, servicePayload)
        setSuccess(`Service "${form.name}" created successfully.`)
      }

      resetForm()
      await loadServices(profile.business_id)
    } catch (err: any) {
      console.error('Error saving service:', err)
      setError(err.message || 'Failed to save service details.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && services.length === 0) {
    return <LoadingState message="Loading grooming services..." />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader 
        title="Manage Services" 
        description="Create and edit grooming packages and treatments."
        action={
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
        }
      />

      {/* Global Alerts */}
      {error && (
        <AlertMessage type="error" message={error} />
      )}

      {success && (
        <AlertMessage type="success" message={success} />
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Columns: Services List */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard 
            title="Available Services" 
            icon={<Scissors className="w-5 h-5" />}
            headerAction={
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {services.length} {services.length === 1 ? 'Service' : 'Services'}
              </span>
            }
            className="h-full"
          >
            <div className="-mx-6 -my-6 divide-y divide-slate-100">
              {services.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-4">
                  <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                    <Scissors className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-700">No Services Found</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed font-medium">Get started by creating your first grooming service.</p>
                  </div>
                </div>
              ) : (
                services.map((service) => (
                  <div
                    key={service.id}
                    className={`p-6 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
                      !service.is_active ? 'bg-slate-50/20 opacity-75' : ''
                    }`}
                  >
                    {/* Service Info */}
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-2">
                        <h3 className="font-extrabold text-slate-800 text-base font-sans">{service.name}</h3>
                        <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-md capitalize">
                          {DOG_SIZES.find((ds) => ds.value === service.dog_size)?.label || service.dog_size || 'All Sizes'}
                        </span>
                        <StatusBadge 
                          status={service.is_active ? 'active' : 'inactive'} 
                          label={service.is_active ? 'Active' : 'Inactive'} 
                        />
                      </div>

                      {service.description && (
                        <p className="text-slate-500 text-sm leading-relaxed max-w-lg font-medium">
                          {service.description}
                        </p>
                      )}

                      <div className="flex items-center space-x-4 pt-1 text-xs font-bold text-slate-400">
                        <span className="flex items-center space-x-1.5">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span>{service.duration_minutes} min</span>
                        </span>
                        <span className="flex items-center space-x-1.5">
                          <ArrowUpDown className="w-4 h-4 text-slate-400" />
                          <span>Sort Order: {service.sort_order}</span>
                        </span>
                      </div>
                    </div>

                    {/* Price and Actions */}
                    <div className="flex items-center justify-between md:justify-end md:space-x-6 shrink-0 pt-3 md:pt-0 border-t border-slate-100 md:border-0">
                      <div className="text-left md:text-right">
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Price</span>
                        <span className="text-xl font-extrabold text-slate-800 font-mono">
                          R {(service.price_cents / 100).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        {/* Edit Button */}
                        <button
                          onClick={() => handleEditClick(service)}
                          title="Edit Service"
                          className="p-2 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-500 hover:text-indigo-600 rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {/* Toggle Active Button */}
                        <button
                          onClick={() => handleToggleActive(service)}
                          title={service.is_active ? 'Deactivate Service' : 'Activate Service'}
                          className={`p-2 border rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 ${
                            service.is_active
                              ? 'border-slate-200 hover:border-red-300 hover:bg-red-50/50 text-slate-400 hover:text-red-600 focus:ring-red-500/20'
                              : 'border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 focus:ring-emerald-500/20'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Create/Edit Form */}
        <div className="lg:col-span-1">
          <SectionCard 
            title={editingId ? 'Edit Service' : 'Create Service'} 
            className="sticky top-24"
          >
            <form onSubmit={handleFormSubmit} className="space-y-5">
              {/* Service Name */}
              <FormField label="Service Name" required>
                <input
                  type="text"
                  name="name"
                  required
                  value={form.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Grooming Special"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              {/* Description */}
              <FormField label="Description">
                <textarea
                  name="description"
                  rows={3}
                  value={form.description}
                  onChange={handleInputChange}
                  placeholder="What is included in this package..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              {/* Dog Size */}
              <FormField label="Target Dog Size">
                <select
                  name="dog_size"
                  value={form.dog_size}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm bg-white"
                >
                  {DOG_SIZES.map((size) => (
                    <option key={size.value} value={size.value}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* Duration and Price (Grid) */}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Duration (Min)" required>
                  <input
                    type="number"
                    name="duration_minutes"
                    min="1"
                    required
                    value={form.duration_minutes}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                  />
                </FormField>

                <FormField label="Price (Rands)" required>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">R</span>
                    <input
                      type="number"
                      name="price_rand"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={form.price_rand}
                      onChange={handleInputChange}
                      className="w-full pl-8 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                    />
                  </div>
                </FormField>
              </div>

              {/* Sort Order */}
              <FormField label="Sort Order">
                <input
                  type="number"
                  name="sort_order"
                  value={form.sort_order}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 text-sm"
                />
              </FormField>

              {/* Active Toggle */}
              <div className="flex items-center space-x-3 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleCheckboxChange}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:outline-none"
                />
                <label htmlFor="is_active" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                  Service is active & bookable
                </label>
              </div>

              {/* Deactivation warning warning card */}
              {!form.is_active && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start space-x-2 animate-fadeIn font-semibold">
                  <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-extrabold uppercase tracking-wide">Notice:</span> Deactivating a service hides it from public booking selections but preserves all existing/past appointments.
                  </div>
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                {(editingId || form.name || form.description || form.price_rand) && (
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={submitting}
                    className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 focus:outline-none"
                  >
                    {editingId ? 'Cancel Edit' : 'Clear Form'}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>{editingId ? 'Save Changes' : 'Create Service'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

