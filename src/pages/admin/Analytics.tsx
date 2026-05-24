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
  Users,
  FileText,
  Printer
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
import { supabase } from '../../lib/supabase'

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

  // Monthly Business Report State
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth())
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear())
  const [reportBookings, setReportBookings] = useState<AnalyticsBooking[]>([])
  const [prevReportBookings, setPrevReportBookings] = useState<AnalyticsBooking[]>([])
  const [newCustomersCount, setNewCustomersCount] = useState<number>(0)
  const [loadingReport, setLoadingReport] = useState<boolean>(true)
  const [reportError, setReportError] = useState<string | null>(null)

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
        setReportMonth(nowLocal.month)
        setReportYear(nowLocal.year)
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

  // Fetch report data when businessId, timezone, reportMonth, or reportYear change
  useEffect(() => {
    const businessId = profile?.business_id
    if (!businessId || !timezone) return

    async function loadReportData() {
      try {
        setLoadingReport(true)
        setReportError(null)

        // 1. Current Month boundaries
        const lastDayCurr = new Date(reportYear, reportMonth + 1, 0).getDate()
        const startCurrUtc = localTimeToUTC(reportYear, reportMonth, 1, 0, 0, 0, timezone)
        const endCurrUtc = localTimeToUTC(reportYear, reportMonth, lastDayCurr, 23, 59, 59, timezone)

        // 2. Previous Month boundaries
        let prevYear = reportYear
        let prevMonth = reportMonth - 1
        if (reportMonth === 0) {
          prevYear = reportYear - 1
          prevMonth = 11
        }
        const lastDayPrev = new Date(prevYear, prevMonth + 1, 0).getDate()
        const startPrevUtc = localTimeToUTC(prevYear, prevMonth, 1, 0, 0, 0, timezone)
        const endPrevUtc = localTimeToUTC(prevYear, prevMonth, lastDayPrev, 23, 59, 59, timezone)

        // 3. Fetch in parallel (bookings and new customers count)
        const [currData, prevData, customerCountResponse] = await Promise.all([
          fetchAnalyticsData(businessId!, startCurrUtc.toISOString(), endCurrUtc.toISOString()),
          fetchAnalyticsData(businessId!, startPrevUtc.toISOString(), endPrevUtc.toISOString()),
          supabase
            .from('customers')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId!)
            .gte('created_at', startCurrUtc.toISOString())
            .lte('created_at', endCurrUtc.toISOString())
        ])

        setReportBookings(currData)
        setPrevReportBookings(prevData)
        setNewCustomersCount(customerCountResponse.count || 0)
      } catch (err: any) {
        console.error('Error loading analytics report:', err)
        setReportError(err.message || 'Failed to load report data.')
      } finally {
        setLoadingReport(false)
      }
    }

    loadReportData()
  }, [profile, timezone, reportMonth, reportYear])

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

  // --- Monthly Business Report Calculations ---
  const repTotalBookings = reportBookings.length
  const repConfirmed = reportBookings.filter(b => b.status === 'confirmed').length
  const repCompleted = reportBookings.filter(b => b.status === 'completed').length
  const repConfirmedCompleted = repConfirmed + repCompleted
  const repCancelled = reportBookings.filter(b => b.status === 'cancelled').length
  const repNoShow = reportBookings.filter(b => b.status === 'no_show').length
  
  const repEstimatedRevenue = reportBookings
    .filter(b => b.status === 'confirmed' || b.status === 'completed')
    .reduce((sum, b) => sum + (b.service?.price_cents || 0), 0)
    
  const repOnline = reportBookings.filter(b => b.source === 'online').length
  const repPhone = reportBookings.filter(b => b.source === 'phone').length
  const repWalkIn = reportBookings.filter(b => b.source === 'walk_in').length
  const repAdmin = reportBookings.filter(b => b.source === 'admin').length

  // Busiest Day of Week
  const repDayCounts: Record<number, number> = {}
  reportBookings.forEach(b => {
    const localParts = utcToLocalTimeParts(new Date(b.start_time), timezone)
    const dayCheck = new Date(Date.UTC(localParts.year, localParts.month, localParts.day))
    const dayOfWeek = dayCheck.getUTCDay()
    repDayCounts[dayOfWeek] = (repDayCounts[dayOfWeek] || 0) + 1
  })
  const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const repBusiestDayEntry = Object.entries(repDayCounts).sort((a, b) => b[1] - a[1])[0]

  // Services Map
  const repServicesMap: Record<string, number> = {}
  reportBookings.forEach(b => {
    const sName = b.service?.name || 'Unknown Service'
    repServicesMap[sName] = (repServicesMap[sName] || 0) + 1
  })
  const repPopularServiceEntry = Object.entries(repServicesMap).sort((a, b) => b[1] - a[1])[0]
  const repPopularService = repPopularServiceEntry ? { name: repPopularServiceEntry[0], count: repPopularServiceEntry[1] } : null

  // Top 3 Services for report month
  const repTop3Services = Object.entries(repServicesMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  // MoM Comparison Calculations
  const prevConfirmedCompleted = prevReportBookings.filter(b => b.status === 'confirmed' || b.status === 'completed').length
  const prevEstimatedRevenue = prevReportBookings
    .filter(b => b.status === 'confirmed' || b.status === 'completed')
    .reduce((sum, b) => sum + (b.service?.price_cents || 0), 0)
  const prevOnline = prevReportBookings.filter(b => b.source === 'online').length
  const prevBad = prevReportBookings.filter(b => b.status === 'cancelled' || b.status === 'no_show').length
  const prevTotal = prevReportBookings.length

  let prevMonthIdx = reportMonth - 1
  let prevYearNum = reportYear
  if (reportMonth === 0) {
    prevMonthIdx = 11
    prevYearNum = reportYear - 1
  }
  const prevMonthName = `${monthNames[prevMonthIdx]} ${prevYearNum}`

  const bookingDiff = repConfirmedCompleted - prevConfirmedCompleted
  const bookingLabel = bookingDiff > 0
    ? `Confirmed/completed increased by ${bookingDiff}`
    : bookingDiff < 0
    ? `Confirmed/completed decreased by ${Math.abs(bookingDiff)}`
    : `Confirmed/completed stayed the same`

  const revenueDiff = repEstimatedRevenue - prevEstimatedRevenue
  const revenueLabel = revenueDiff > 0
    ? `Revenue increased by R${Math.abs(revenueDiff / 100).toFixed(0)}`
    : revenueDiff < 0
    ? `Revenue decreased by R${Math.abs(revenueDiff / 100).toFixed(0)}`
    : `Revenue stayed the same`

  const onlineDiff = repOnline - prevOnline
  const onlineLabel = onlineDiff > 0
    ? `Online requests increased by ${onlineDiff}`
    : onlineDiff < 0
    ? `Online requests decreased by ${Math.abs(onlineDiff)}`
    : `Online requests stayed the same`

  const badDiff = (repCancelled + repNoShow) - prevBad
  const badLabel = badDiff > 0
    ? `Cancellations/no-shows increased by ${badDiff}`
    : badDiff < 0
    ? `Cancellations/no-shows decreased by ${Math.abs(badDiff)}`
    : `Cancellations/no-shows stayed the same`

  // 3 Short Bullet Insights Max
  const reportInsights: string[] = []
  if (repPopularService) {
    reportInsights.push(`${repPopularService.name} was your most booked service.`)
  }
  if (prevTotal > 0) {
    if (revenueDiff > 0) {
      reportInsights.push(`Revenue improved compared with last month.`)
    } else if (revenueDiff < 0) {
      reportInsights.push(`Revenue declined compared with last month.`)
    } else {
      reportInsights.push(`Revenue remained stable compared with last month.`)
    }
  }
  const repBadCount = repCancelled + repNoShow
  if (repTotalBookings > 0 && (repBadCount / repTotalBookings) >= 0.15) {
    reportInsights.push(`Watch cancellations/no-shows this month.`)
  } else if (newCustomersCount > 0) {
    reportInsights.push(`${newCustomersCount} new customer${newCustomersCount === 1 ? '' : 's'} registered.`)
  } else {
    reportInsights.push(`Steady booking activity observed.`)
  }
  const finalInsights = reportInsights.slice(0, 3)

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
      {/* Print stylesheet */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          body * {
            visibility: hidden;
          }
          #monthly-business-report-print-area, #monthly-business-report-print-area * {
            visibility: visible;
          }
          #monthly-business-report-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Main dashboard view (hidden on print) */}
      <div className="no-print space-y-8">
        <PageHeader
          title="Business Analytics"
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
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-slate-905 md:items-center justify-between gap-4">
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
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer text-slate-800"
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
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">To</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800"
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
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Requests Received</span>
                  <div className="w-8 h-8 bg-indigo-50 text-indigo-650 rounded-xl flex items-center justify-center">
                    <CalendarRange className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black text-slate-800 tracking-tight">{totalBookings}</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                    All requests logged
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
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Online Requests</span>
                  <div className="w-8 h-8 bg-blue-50 text-blue-650 rounded-xl flex items-center justify-center">
                    <Laptop className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black text-slate-800 tracking-tight">
                    {onlinePercentage.toFixed(1)}%
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                    {onlineCount} of {totalBookings} total requests
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
                      <tr className="border-b border-slate-205 text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">
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
                          <td className="py-3 px-4 text-center text-slate-600">
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
                                <span className="text-xs text-slate-400 font-normal">({month.mostPopularService.count})</span>
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
                        <span className="font-extrabold text-indigo-650">{formatPrice(month.estimatedRevenueCents)}</span>
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
                        <div className="col-span-2 border-t border-slate-100 pt-2">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Most Popular Service</span>
                          <span className="text-slate-700 text-xs font-bold">
                            {month.mostPopularService ? (
                              <>
                                {month.mostPopularService.name}{' '}
                                <span className="text-xs text-slate-400 font-normal">({month.mostPopularService.count} bookings)</span>
                              </>
                            ) : (
                              <span className="text-slate-400 font-normal">No bookings</span>
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
                title="Requests by Source"
                icon={<BarChart2 className="w-5 h-5" />}
                className="flex flex-col justify-between"
              >
                <div className="space-y-6">
                  {[
                    { name: 'Online requests', key: 'online', count: onlineCount, color: 'bg-indigo-600', icon: <Laptop className="w-4 h-4" /> },
                    { name: 'Phone requests', key: 'phone', count: phoneCount, color: 'bg-blue-600', icon: <Phone className="w-4 h-4" /> },
                    { name: 'Walk-in requests', key: 'walk_in', count: walkInCount, color: 'bg-teal-600', icon: <Users className="w-4 h-4" /> },
                    ...(adminCount > 0 ? [{ name: 'Other manual requests', key: 'admin', count: adminCount, color: 'bg-purple-600', icon: <User className="w-4 h-4" /> }] : [])
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
                    { name: 'Pending Requests', key: 'pending', count: pendingCount, color: 'bg-amber-500', barBg: 'bg-amber-50 text-amber-700 border-amber-200' },
                    { name: 'Cancelled Bookings', key: 'cancelled', count: cancelledCount, color: 'bg-red-500', barBg: 'bg-red-50 text-red-800 border-red-200' },
                    { name: 'Client No-Shows', key: 'no_show', count: noShowCount, color: 'bg-slate-400', barBg: 'bg-slate-50 text-slate-500 border-slate-200' }
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
                    <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">
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
                          <td className="py-3.5 px-4 text-center text-slate-500">{pct.toFixed(1)}%</td>
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
          </div>
        )}
      </div>

      {/* 2. Monthly Business Report Section Card */}
      <div className="mt-8 print:mt-0 print:border-none print:shadow-none">
        <SectionCard
          title="Monthly Business Report"
          icon={<FileText className="w-5 h-5" />}
          className="print:border-none print:shadow-none"
        >
          <div className="space-y-6">
            <p className="text-sm text-slate-500 font-medium no-print">
              Generate a clean, printable operational performance report for any specific month. This aggregates bookings, services, new clients, and compares them against the previous month.
            </p>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl no-print">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Month</span>
                <select
                  value={reportMonth}
                  onChange={e => setReportMonth(Number(e.target.value))}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer text-slate-800"
                >
                  {monthNames.map((name, idx) => (
                    <option key={name} value={idx}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Year</span>
                <select
                  value={reportYear}
                  onChange={e => setReportYear(Number(e.target.value))}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer text-slate-800"
                >
                  {Array.from({ length: 5 }, (_, idx) => new Date().getFullYear() - idx).map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer ml-auto focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <Printer className="w-4 h-4" />
                <span>Print Report</span>
              </button>
            </div>

            {/* Report Render Area */}
            {loadingReport ? (
              <div className="py-12 text-center text-slate-400 font-semibold text-sm">
                Loading report details...
              </div>
            ) : reportError ? (
              <div className="py-4 text-red-650 text-sm font-semibold">
                {reportError}
              </div>
            ) : (
              <div id="monthly-business-report-print-area" className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6 text-slate-800 shadow-xs print:border-none print:shadow-none print:p-0">
                {/* A) Report Header */}
                <div className="border-b border-slate-150 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-600 no-print" />
                      <span>Monthly Business Performance Report</span>
                    </h2>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      A simple summary of bookings, revenue, and customer activity.
                    </p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-lg font-black text-indigo-655 text-indigo-650">{monthNames[reportMonth]} {reportYear}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      Generated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* B) Main Scorecards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="border border-slate-200 bg-slate-50/50 p-5 rounded-2xl flex flex-col justify-between min-h-[100px]">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Estimated Revenue</span>
                    <p className="text-2xl font-black text-slate-800 mt-2">{formatPrice(repEstimatedRevenue)}</p>
                    <span className="text-[9px] font-semibold text-slate-400 block mt-1">Confirmed & Completed</span>
                  </div>
                  <div className="border border-slate-200 bg-slate-50/50 p-5 rounded-2xl flex flex-col justify-between min-h-[100px]">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Requests Received</span>
                    <p className="text-2xl font-black text-slate-800 mt-2">{repTotalBookings}</p>
                    <span className="text-[9px] font-semibold text-slate-400 block mt-1">All requests logged</span>
                  </div>
                  <div className="border border-slate-200 bg-slate-50/50 p-5 rounded-2xl flex flex-col justify-between min-h-[100px]">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Confirmed / Completed</span>
                    <p className="text-2xl font-black text-slate-800 mt-2">{repConfirmedCompleted}</p>
                    <span className="text-[9px] font-semibold text-slate-400 block mt-1">Realized grooms</span>
                  </div>
                  <div className="border border-slate-200 bg-slate-50/50 p-5 rounded-2xl flex flex-col justify-between min-h-[100px]">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Cancelled Requests</span>
                    <p className="text-2xl font-black text-slate-800 mt-2">{repCancelled}</p>
                    <span className="text-[9px] font-semibold text-slate-400 block mt-1">Cancelled or rejected</span>
                  </div>
                  <div className="border border-slate-200 bg-slate-50/50 p-5 rounded-2xl flex flex-col justify-between min-h-[100px]">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Client No-Shows</span>
                    <p className="text-2xl font-black text-slate-800 mt-2">{repNoShow}</p>
                    <span className="text-[9px] font-semibold text-slate-400 block mt-1">Missed appointments</span>
                  </div>
                </div>

                {/* C) Compared with Last Month section */}
                <div className="border border-slate-200 rounded-3xl p-5 md:p-6 bg-slate-50/30 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Compared with Last Month ({prevMonthName})</h3>
                  </div>

                  {prevTotal === 0 ? (
                    <p className="text-xs font-semibold text-slate-450 italic py-2">No previous month data yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Revenue MoM Card */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Revenue Change</span>
                          <span className="text-xs font-extrabold text-slate-800 mt-1 block">{revenueLabel}</span>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ml-2 ${revenueDiff > 0 ? 'bg-emerald-500' : revenueDiff < 0 ? 'bg-rose-500' : 'bg-slate-300'}`} />
                      </div>

                      {/* Bookings MoM Card */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Bookings Change</span>
                          <span className="text-xs font-extrabold text-slate-800 mt-1 block">{bookingLabel}</span>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ml-2 ${bookingDiff > 0 ? 'bg-emerald-500' : bookingDiff < 0 ? 'bg-rose-500' : 'bg-slate-300'}`} />
                      </div>

                      {/* Online MoM Card */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Online Requests</span>
                          <span className="text-xs font-extrabold text-slate-800 mt-1 block">{onlineLabel}</span>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ml-2 ${onlineDiff !== 0 ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                      </div>

                      {/* Cancellations MoM Card */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Cancellations</span>
                          <span className="text-xs font-extrabold text-slate-800 mt-1 block">{badLabel}</span>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ml-2 ${badDiff > 0 ? 'bg-rose-500' : badDiff < 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      </div>
                    </div>
                  )}
                </div>

                {/* D) Booking Source Mix & E) Service Performance Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Side: Booking Source Mix */}
                  <div className="border border-slate-200 p-5 rounded-3xl space-y-4 bg-white">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block border-b border-slate-100 pb-2">Requests by Source</h4>
                    <div className="space-y-4">
                      {[
                        { name: 'Online requests', count: repOnline, color: 'bg-indigo-500' },
                        { name: 'Phone requests', count: repPhone, color: 'bg-sky-500' },
                        { name: 'Walk-in requests', count: repWalkIn, color: 'bg-emerald-500' },
                        ...(repAdmin > 0 ? [{ name: 'Other manual requests', count: repAdmin, color: 'bg-slate-400' }] : [])
                      ].map(src => {
                        const pct = repTotalBookings > 0 ? (src.count / repTotalBookings) * 100 : 0
                        return (
                          <div key={src.name} className="space-y-1.5 text-xs font-semibold">
                            <div className="flex justify-between items-center text-slate-650">
                              <span>{src.name}</span>
                              <span className="text-slate-800 font-bold">{src.count} requests ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                  className={`h-full ${src.color} rounded-full transition-all duration-300`}
                                  style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Right Side: Service Performance & Busiest Day */}
                  <div className="border border-slate-200 p-5 rounded-3xl space-y-4 bg-white flex flex-col justify-between">
                    <div className="space-y-4">
                      {repPopularService ? (
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest block">Most Popular Service</span>
                            <span className="text-base font-extrabold text-slate-800 mt-1 block">{repPopularService.name}</span>
                            <span className="text-xs text-slate-505 text-slate-500 block mt-0.5">{repPopularService.count} bookings this month</span>
                          </div>
                          <div className="w-12 h-12 bg-indigo-105 text-indigo-700 rounded-2xl flex items-center justify-center font-bold text-lg bg-indigo-100">
                            ★
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-slate-400 italic">No bookings recorded.</p>
                      )}

                      {repTop3Services.length > 0 && (
                        <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Top Ranked Services</span>
                          <div className="space-y-2.5">
                            {repTop3Services.map((srv, idx) => (
                              <div key={srv.name} className="flex items-center justify-between text-xs font-semibold">
                                <div className="flex items-center space-x-2">
                                  <span className="w-5 h-5 bg-slate-100 text-slate-550 border border-slate-200/60 rounded-full flex items-center justify-center font-bold text-[10px]">
                                    {idx + 1}
                                  </span>
                                  <span className="text-slate-800 font-bold">{srv.name}</span>
                                </div>
                                <span className="text-slate-550 text-slate-500 font-bold">{srv.count} {srv.count === 1 ? 'booking' : 'bookings'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* F) Busiest Day Card */}
                    <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Busiest Day</span>
                        <span className="text-xs font-extrabold text-slate-800 mt-0.5 block">
                          {repBusiestDayEntry ? dayOfWeekNames[Number(repBusiestDayEntry[0])] : 'N/A'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Volume</span>
                        <span className="text-xs font-bold text-slate-650 mt-0.5 block">
                          {repBusiestDayEntry ? `${repBusiestDayEntry[1]} bookings` : '0 bookings'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* G) Insights section */}
                <div className="border border-indigo-100 bg-indigo-50/20 p-5 rounded-3xl space-y-3 font-sans">
                  <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest block border-b border-indigo-150/40 pb-1.5">Business Insights</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {finalInsights.map((insight, idx) => (
                      <div key={idx} className="bg-white border border-indigo-100/50 p-4 rounded-xl text-xs font-bold text-slate-700 flex items-start space-x-2 leading-relaxed">
                        <span className="text-indigo-650">•</span>
                        <span>{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
