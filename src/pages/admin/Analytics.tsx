import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  BarChart2,
  TrendingUp,
  DollarSign,
  CalendarRange,
  Laptop,
  Phone,
  User,
  RefreshCw,
  Sparkles,
  Scissors,
  Clock,
  Users
} from 'lucide-react'
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingState,
  AlertMessage
} from '../../components/UI'
import { localTimeToUTC, utcToLocalTimeParts } from '../../lib/dateTime'
import { fetchAnalyticsData, fetchBusinessTimezone, type AnalyticsBooking } from '../../services/analyticsService'

// Helper to format price from cents to Rands
const formatPrice = (cents: number): string => {
  return `R ${(cents / 100).toFixed(2)}`
}

type RangeType = 'this_month' | 'this_year' | 'monthly_comparison' | 'custom'

export default function Analytics() {
  const { profile } = useAuth()
  const [timezone, setTimezone] = useState<string>('Africa/Johannesburg')
  const [rangeType, setRangeType] = useState<RangeType>('this_month')
  
  // Custom date picker states (YYYY-MM-DD local digits)
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')

  // Year selector for Monthly Comparison
  const [comparisonYear, setComparisonYear] = useState<number>(new Date().getFullYear())

  // Data & loading states
  const [bookings, setBookings] = useState<AnalyticsBooking[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Load timezone on mount
  useEffect(() => {
    const businessId = profile?.business_id
    if (!businessId) return

    async function loadTimezone() {
      try {
        const tz = await fetchBusinessTimezone(businessId!)
        setTimezone(tz)
        
        // Initialize custom dates and comparison year in business timezone
        const nowLocal = utcToLocalTimeParts(new Date(), tz)
        const formatDigit = (num: number) => num.toString().padStart(2, '0')
        const todayStr = `${nowLocal.year}-${formatDigit(nowLocal.month + 1)}-${formatDigit(nowLocal.day)}`
        
        setCustomStart(todayStr)
        setCustomEnd(todayStr)
        setComparisonYear(nowLocal.year)
      } catch (err) {
        console.error('Error fetching business timezone:', err)
      }
    }

    loadTimezone()
  }, [profile])

  // Fetch data when businessId, timezone, rangeType, custom dates, or comparisonYear change
  useEffect(() => {
    const businessId = profile?.business_id
    if (!businessId || !timezone) return

    // If custom is selected but dates aren't set, skip
    if (rangeType === 'custom' && (!customStart || !customEnd)) return

    async function loadAnalytics() {
      try {
        setLoading(true)
        setError(null)

        // 1. Calculate boundaries in business timezone
        const now = new Date()
        const localNow = utcToLocalTimeParts(now, timezone)
        
        let startYear = localNow.year
        let startMonth = localNow.month
        let startDay = localNow.day
        
        let endYear = localNow.year
        let endMonth = localNow.month
        let endDay = localNow.day

        if (rangeType === 'this_month') {
          startDay = 1
          const lastDay = new Date(startYear, startMonth + 1, 0).getDate()
          endDay = lastDay
        } else if (rangeType === 'this_year') {
          startMonth = 0
          startDay = 1
          endMonth = 11
          endDay = 31
        } else if (rangeType === 'monthly_comparison') {
          startYear = comparisonYear
          startMonth = 0
          startDay = 1
          endYear = comparisonYear
          endMonth = 11
          endDay = 31
        } else if (rangeType === 'custom') {
          const [sYear, sMonth, sDay] = customStart.split('-').map(Number)
          startYear = sYear
          startMonth = sMonth - 1
          startDay = sDay
          
          const [eYear, eMonth, eDay] = customEnd.split('-').map(Number)
          endYear = eYear
          endMonth = eMonth - 1
          endDay = eDay
        }

        const startUtc = localTimeToUTC(startYear, startMonth, startDay, 0, 0, 0, timezone)
        const endUtc = localTimeToUTC(endYear, endMonth, endDay, 23, 59, 59, timezone)

        // 2. Query data
        const data = await fetchAnalyticsData(businessId!, startUtc.toISOString(), endUtc.toISOString())
        setBookings(data)
      } catch (err: any) {
        console.error('Error fetching analytics:', err)
        setError(err.message || 'Failed to load analytics data.')
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()
  }, [profile, timezone, rangeType, customStart, customEnd, comparisonYear])

  // Calculation helpers
  const totalBookings = bookings.length
  
  const pendingCount = bookings.filter(b => b.status === 'pending').length
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length
  const completedCount = bookings.filter(b => b.status === 'completed').length
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length
  const noShowCount = bookings.filter(b => b.status === 'no_show').length

  // Bookings by Source
  const onlineCount = bookings.filter(b => b.source === 'online').length
  const phoneCount = bookings.filter(b => b.source === 'phone').length
  const walkInCount = bookings.filter(b => b.source === 'walk_in').length
  const adminCount = bookings.filter(b => b.source === 'admin').length

  const onlinePercentage = totalBookings > 0 ? (onlineCount / totalBookings) * 100 : 0

  // Revenue metrics: confirmed + completed bookings only
  const revenueBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed')
  const estimatedRevenueCents = revenueBookings.reduce((sum, b) => sum + (b.service?.price_cents || 0), 0)
  
  const revenueBookingsCount = revenueBookings.length
  const averageBookingValueCents = revenueBookingsCount > 0 ? Math.round(estimatedRevenueCents / revenueBookingsCount) : 0

  // Popular Services: Group by service name
  const servicesMap: Record<string, { count: number; revenueCents: number; duration: number }> = {}
  bookings.forEach(b => {
    const sName = b.service?.name || 'Unknown Service'
    const price = b.service?.price_cents || 0
    const duration = b.service?.duration_minutes || 0

    if (!servicesMap[sName]) {
      servicesMap[sName] = { count: 0, revenueCents: 0, duration: 0 }
    }
    servicesMap[sName].count += 1
    
    // Revenue counts if confirmed or completed
    if (b.status === 'confirmed' || b.status === 'completed') {
      servicesMap[sName].revenueCents += price
    }
    servicesMap[sName].duration += duration
  })

  const popularServices = Object.entries(servicesMap)
    .map(([name, data]) => ({
      name,
      count: data.count,
      revenueCents: data.revenueCents,
      avgDuration: Math.round(data.duration / data.count)
    }))
    .sort((a, b) => b.count - a.count)

  const mostPopularService = popularServices.length > 0 ? popularServices[0] : null

  // Monthly Comparison Stats Calculation
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  interface MonthlyStats {
    monthIndex: number
    monthName: string
    totalBookings: number
    confirmedCompletedCount: number
    onlineCount: number
    estimatedRevenueCents: number
    averageBookingValueCents: number
    mostPopularService: { name: string; count: number } | null
  }

  const monthlyData: MonthlyStats[] = monthNames.map((name, index) => ({
    monthIndex: index,
    monthName: name,
    totalBookings: 0,
    confirmedCompletedCount: 0,
    onlineCount: 0,
    estimatedRevenueCents: 0,
    averageBookingValueCents: 0,
    mostPopularService: null
  }))

  const monthlyServicesMap: Record<number, Record<string, number>> = {}
  monthNames.forEach((_, index) => {
    monthlyServicesMap[index] = {}
  })

  bookings.forEach(b => {
    const localParts = utcToLocalTimeParts(new Date(b.start_time), timezone)
    const mIdx = localParts.month
    
    if (mIdx >= 0 && mIdx < 12) {
      const stats = monthlyData[mIdx]
      stats.totalBookings += 1
      
      const isConfirmedOrCompleted = b.status === 'confirmed' || b.status === 'completed'
      if (isConfirmedOrCompleted) {
        stats.confirmedCompletedCount += 1
        stats.estimatedRevenueCents += b.service?.price_cents || 0
      }
      
      if (b.source === 'online') {
        stats.onlineCount += 1
      }
      
      const sName = b.service?.name || 'Unknown Service'
      monthlyServicesMap[mIdx][sName] = (monthlyServicesMap[mIdx][sName] || 0) + 1
    }
  })

  monthlyData.forEach(stats => {
    if (stats.confirmedCompletedCount > 0) {
      stats.averageBookingValueCents = Math.round(stats.estimatedRevenueCents / stats.confirmedCompletedCount)
    }
    
    const services = Object.entries(monthlyServicesMap[stats.monthIndex])
    if (services.length > 0) {
      services.sort((a, b) => b[1] - a[1])
      stats.mostPopularService = {
        name: services[0][0],
        count: services[0][1]
      }
    }
  })

  // Trigger manual refresh
  const handleRefresh = async () => {
    const businessId = profile?.business_id
    if (!businessId || !timezone) return
    
    try {
      setLoading(true)
      setError(null)
      // Recalculate ranges for query
      const now = new Date()
      const localNow = utcToLocalTimeParts(now, timezone)
      let startYear = localNow.year, startMonth = localNow.month, startDay = localNow.day
      let endYear = localNow.year, endMonth = localNow.month, endDay = localNow.day

      if (rangeType === 'this_month') {
        startDay = 1
        endDay = new Date(startYear, startMonth + 1, 0).getDate()
      } else if (rangeType === 'this_year') {
        startMonth = 0; startDay = 1
        endMonth = 11; endDay = 31
      } else if (rangeType === 'monthly_comparison') {
        startYear = comparisonYear
        startMonth = 0; startDay = 1
        endYear = comparisonYear
        endMonth = 11; endDay = 31
      } else if (rangeType === 'custom') {
        const [sYear, sMonth, sDay] = customStart.split('-').map(Number)
        startYear = sYear; startMonth = sMonth - 1; startDay = sDay
        const [eYear, eMonth, eDay] = customEnd.split('-').map(Number)
        endYear = eYear; endMonth = eMonth - 1; endDay = eDay
      }

      const startUtc = localTimeToUTC(startYear, startMonth, startDay, 0, 0, 0, timezone)
      const endUtc = localTimeToUTC(endYear, endMonth, endDay, 23, 59, 59, timezone)

      const data = await fetchAnalyticsData(businessId, startUtc.toISOString(), endUtc.toISOString())
      setBookings(data)
    } catch (err: any) {
      setError(err.message || 'Failed to refresh analytics data.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fadeIn text-slate-800">
      {/* Header */}
      <PageHeader
        title="Admin Analytics"
        description="Monitor booking performance, service trends, and estimated revenue streams."
        action={
          <button
            onClick={handleRefresh}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 font-bold rounded-xl transition-all cursor-pointer text-sm flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        }
      />

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Presets */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl">
          {(['this_month', 'this_year', 'monthly_comparison', 'custom'] as const).map(preset => {
            const labels: Record<RangeType, string> = {
              this_month: 'This Month',
              this_year: 'This Year',
              monthly_comparison: 'Monthly Comparison',
              custom: 'Custom Range'
            }
            return (
              <button
                key={preset}
                onClick={() => setRangeType(preset)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  rangeType === preset
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {labels[preset]}
              </button>
            )
          })}
        </div>

        {/* Year selector for Monthly Comparison */}
        {rangeType === 'monthly_comparison' && (
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Compare Year</span>
            <select
              value={comparisonYear}
              onChange={e => setComparisonYear(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
            >
              {Array.from({ length: 5 }, (_, idx) => new Date().getFullYear() - idx).map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Custom Range Selectors */}
        {rangeType === 'custom' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">From</span>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">To</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
              />
            </div>
          </div>
        )}
      </div>

      {error && <AlertMessage type="error" message={error} />}

      {loading ? (
        <LoadingState message="Calculating analytics metrics..." />
      ) : totalBookings === 0 ? (
        <EmptyState
          title="No Data Available"
          description="There are no appointments recorded within the selected date range. Try expanding your search or selecting another period."
          icon={<CalendarRange className="w-10 h-10 text-slate-350" />}
        />
      ) : (
        <div className="space-y-8 animate-fadeIn">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Estimated Revenue */}
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 text-white rounded-3xl p-6 shadow-sm flex flex-col justify-between min-h-[140px] relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 opacity-15 transform translate-x-3 translate-y-3 pointer-events-none group-hover:scale-110 transition-transform duration-300">
                <DollarSign className="w-36 h-36" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-100">Estimated Revenue</span>
                <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-black tracking-tight">{formatPrice(estimatedRevenueCents)}</h3>
                <p className="text-[10px] font-bold text-indigo-150 mt-1 uppercase tracking-wide">
                  {revenueBookingsCount} confirmed/completed
                </p>
              </div>
            </div>

            {/* Total Bookings */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between min-h-[140px]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Bookings</span>
                <div className="w-8 h-8 bg-indigo-50 text-indigo-650 rounded-xl flex items-center justify-center">
                  <CalendarRange className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">{totalBookings}</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                  Appointments logged
                </p>
              </div>
            </div>

            {/* Average Booking Value */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between min-h-[140px]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Avg Booking Value</span>
                <div className="w-8 h-8 bg-emerald-50 text-emerald-650 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">
                  {formatPrice(averageBookingValueCents)}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                  Per confirmed/completed
                </p>
              </div>
            </div>

            {/* Online Booking Percentage */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between min-h-[140px]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Online Bookings</span>
                <div className="w-8 h-8 bg-blue-50 text-blue-650 rounded-xl flex items-center justify-center">
                  <Laptop className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">
                  {onlinePercentage.toFixed(1)}%
                </h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                  {onlineCount} of {totalBookings} online requests
                </p>
              </div>
            </div>
          </div>

          {/* Monthly Comparison */}
          {rangeType === 'monthly_comparison' && (
            <SectionCard
              title={`Monthly Performance Comparison - ${comparisonYear}`}
              icon={<CalendarRange className="w-5 h-5" />}
            >
              {/* Desktop/Tablet Table Layout */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-450 bg-slate-50/50">
                      <th className="py-3 px-4">Month</th>
                      <th className="py-3 px-4 text-right">Estimated Revenue</th>
                      <th className="py-3 px-4 text-center">Total Bookings</th>
                      <th className="py-3 px-4 text-center">Confirmed + Completed</th>
                      <th className="py-3 px-4 text-center">Online Bookings</th>
                      <th className="py-3 px-4">Most Popular Service</th>
                      <th className="py-3 px-4 text-right">Avg Booking Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-semibold">
                    {monthlyData.map(month => (
                      <tr key={month.monthName} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-3 px-4 text-slate-800 font-bold">
                          {month.monthName}
                        </td>
                        <td className="py-3 px-4 text-right text-indigo-650 font-bold">
                          {formatPrice(month.estimatedRevenueCents)}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-650">
                          {month.totalBookings}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-600">
                          {month.confirmedCompletedCount}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500">
                          {month.onlineCount}
                        </td>
                        <td className="py-3 px-4 text-slate-600 truncate max-w-[180px]" title={month.mostPopularService?.name || 'N/A'}>
                          {month.mostPopularService ? (
                            <span>
                              {month.mostPopularService.name}{' '}
                              <span className="text-xs text-slate-400 font-medium font-normal">({month.mostPopularService.count})</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-650 font-bold">
                          {formatPrice(month.averageBookingValueCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile-Friendly List Layout */}
              <div className="block md:hidden space-y-4">
                {monthlyData.map(month => (
                  <div key={month.monthName} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-extrabold text-slate-800 text-base">{month.monthName}</span>
                      <span className="font-extrabold text-indigo-600">{formatPrice(month.estimatedRevenueCents)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-semibold text-slate-500">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Total Bookings</span>
                        <span className="text-slate-700 text-sm font-bold">{month.totalBookings}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Confirmed/Completed</span>
                        <span className="text-slate-700 text-sm font-bold">{month.confirmedCompletedCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Online Bookings</span>
                        <span className="text-slate-700 text-sm font-bold">{month.onlineCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Avg Booking Value</span>
                        <span className="text-emerald-600 text-sm font-bold">{formatPrice(month.averageBookingValueCents)}</span>
                      </div>
                      <div className="col-span-2 border-t border-slate-100/50 pt-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Most Popular Service</span>
                        <span className="text-slate-750 text-xs font-bold">
                          {month.mostPopularService ? (
                            <>
                              {month.mostPopularService.name}{' '}
                              <span className="text-xs text-slate-400 font-normal">({month.mostPopularService.count} bookings)</span>
                            </>
                          ) : (
                            <span className="text-slate-455 font-normal text-slate-400">No bookings</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Core Analytics Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Booking Source Mix */}
            <SectionCard
              title="Booking Source Mix"
              icon={<BarChart2 className="w-5 h-5" />}
              className="flex flex-col justify-between"
            >
              <div className="space-y-6">
                {[
                  { name: 'Online bookings', key: 'online', count: onlineCount, color: 'bg-indigo-600', icon: <Laptop className="w-4 h-4" /> },
                  { name: 'Phone bookings', key: 'phone', count: phoneCount, color: 'bg-blue-600', icon: <Phone className="w-4 h-4" /> },
                  { name: 'Walk-ins', key: 'walk_in', count: walkInCount, color: 'bg-teal-600', icon: <Users className="w-4 h-4" /> },
                  ...(adminCount > 0 ? [{ name: 'Other manual', key: 'admin', count: adminCount, color: 'bg-purple-600', icon: <User className="w-4 h-4" /> }] : [])
                ].map(src => {
                  const pct = totalBookings > 0 ? (src.count / totalBookings) * 100 : 0
                  return (
                    <div key={src.key} className="space-y-2">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <div className="flex items-center space-x-2.5 text-slate-700">
                          <div className="text-slate-400">{src.icon}</div>
                          <span>{src.name}</span>
                        </div>
                        <div className="text-slate-800">
                          {src.count} <span className="text-slate-400 font-medium text-xs">({pct.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${src.color} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>

            {/* Booking Status Distribution */}
            <SectionCard
              title="Appointment Statuses"
              icon={<Clock className="w-5 h-5" />}
            >
              <div className="space-y-5">
                {[
                  { name: 'Completed Appointments', key: 'completed', count: completedCount, color: 'bg-emerald-500', barBg: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
                  { name: 'Confirmed Slots', key: 'confirmed', count: confirmedCount, color: 'bg-indigo-500', barBg: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
                  { name: 'Pending Requests', key: 'pending', count: pendingCount, color: 'bg-amber-500', barBg: 'bg-amber-50 text-amber-800 border-amber-200' },
                  { name: 'Cancelled Bookings', key: 'cancelled', count: cancelledCount, color: 'bg-red-500', barBg: 'bg-red-50 text-red-800 border-red-200' },
                  { name: 'Client No-Shows', key: 'no_show', count: noShowCount, color: 'bg-slate-400', barBg: 'bg-slate-50 text-slate-550 border-slate-200' }
                ].map(st => {
                  const pct = totalBookings > 0 ? (st.count / totalBookings) * 100 : 0
                  return (
                    <div key={st.key} className="flex items-center space-x-4">
                      {/* Name & Badge */}
                      <div className="w-44 shrink-0">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${st.barBg}`}>
                          {st.key.replace('_', ' ')}
                        </span>
                      </div>
                      {/* Meter & Number */}
                      <div className="flex-grow flex items-center space-x-3">
                        <div className="flex-grow h-2.5 bg-slate-100 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full ${st.color} rounded-full`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-slate-800 shrink-0 w-12 text-right">
                          {st.count}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </div>

          {/* Popular Services Section */}
          <SectionCard
            title="Grooming Services Popularity & Value"
            icon={<Scissors className="w-5 h-5" />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-450 bg-slate-50/50">
                    <th className="py-3 px-4 font-extrabold">Service Name</th>
                    <th className="py-3 px-4 text-center font-extrabold">Appointments Logged</th>
                    <th className="py-3 px-4 text-center font-extrabold">% of Total</th>
                    <th className="py-3 px-4 text-center font-extrabold">Avg Duration</th>
                    <th className="py-3 px-4 text-right font-extrabold">Estimated Revenue Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm font-semibold">
                  {popularServices.map((srv, idx) => {
                    const pct = (srv.count / totalBookings) * 100
                    return (
                      <tr key={srv.name} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-3.5 px-4 text-slate-800 font-bold flex items-center space-x-2">
                          {idx === 0 && <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />}
                          <span>{srv.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-700">{srv.count}</td>
                        <td className="py-3.5 px-4 text-center text-slate-550">{pct.toFixed(1)}%</td>
                        <td className="py-3.5 px-4 text-center text-slate-500">{srv.avgDuration} mins</td>
                        <td className="py-3.5 px-4 text-right text-indigo-650 font-bold">
                          {formatPrice(srv.revenueCents)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Revenue Summaries and Insights */}
          <div className="bg-slate-50/50 border border-slate-200 rounded-3xl p-6 grid grid-cols-1 md:grid-cols-2 gap-8 shadow-xs">
            <div className="space-y-3">
              <h4 className="text-sm font-extrabold uppercase tracking-widest text-slate-450">Estimated Revenue Details</h4>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Estimated revenue sums the default price value of services booked under all <strong className="text-slate-700 font-bold">Confirmed</strong> and <strong className="text-slate-700 font-bold">Completed</strong> statuses. 
              </p>
              <div className="bg-white border border-slate-100 p-4 rounded-2xl flex justify-between items-center text-sm">
                <span className="text-slate-500">Sum of Confirmed + Completed Price:</span>
                <span className="font-extrabold text-indigo-600">{formatPrice(estimatedRevenueCents)}</span>
              </div>
              <div className="bg-white border border-slate-100 p-4 rounded-2xl flex justify-between items-center text-sm">
                <span className="text-slate-500">Excluded (Pending, Cancelled, No-Show Value):</span>
                <span className="font-semibold text-slate-400">
                  {formatPrice(
                    bookings
                      .filter(b => b.status === 'pending' || b.status === 'cancelled' || b.status === 'no_show')
                      .reduce((sum, b) => sum + (b.service?.price_cents || 0), 0)
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-extrabold uppercase tracking-widest text-slate-450">Business Insight Summary</h4>
              <div className="space-y-3">
                {mostPopularService && (
                  <div className="flex items-start space-x-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                      ★
                    </div>
                    <div>
                      <p className="font-bold text-slate-700">Top Service demand</p>
                      <p className="text-slate-500 text-xs mt-0.5 leading-relaxed font-medium">
                        The most frequently requested service is <strong className="text-slate-700 font-semibold">{mostPopularService.name}</strong>, with <strong className="text-slate-700 font-semibold">{mostPopularService.count}</strong> bookings representing <strong className="text-slate-750 font-semibold">{((mostPopularService.count / totalBookings) * 100).toFixed(1)}%</strong> of selected range volume.
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="flex items-start space-x-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                    ✓
                  </div>
                  <div>
                    <p className="font-bold text-slate-700">Online Booking Efficiency</p>
                    <p className="text-slate-500 text-xs mt-0.5 leading-relaxed font-medium">
                      {onlinePercentage > 50 ? (
                        <>Customers primarily book online (<strong className="text-indigo-600 font-semibold">{onlinePercentage.toFixed(1)}%</strong> of appointments). This reduces administrative overhead via walk-ins and phone calls.</>
                      ) : (
                        <>Online bookings represent <strong className="text-indigo-650 font-semibold">{onlinePercentage.toFixed(1)}%</strong> of your schedule. Promotion of the online client portal can save staff time on phone and walk-in entry.</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                    $
                  </div>
                  <div>
                    <p className="font-bold text-slate-700">Target Timezone Configuration</p>
                    <p className="text-slate-500 text-xs mt-0.5 leading-relaxed font-medium">
                      Dates and queries are mapped in local parlor timezone: <strong className="text-slate-700 font-semibold">{timezone}</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
