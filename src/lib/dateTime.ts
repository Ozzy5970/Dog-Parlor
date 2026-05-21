/**
 * Calculates the timezone offset in minutes for a given timezone and date.
 * Following the standard JS Date.getTimezoneOffset() sign convention:
 * - Returns positive values for zones behind UTC (e.g. America/New_York returns +240 or +300)
 * - Returns negative values for zones ahead of UTC (e.g. Africa/Johannesburg returns -120)
 * 
 * This dynamically adapts to daylight saving time changes based on the Date instance passed.
 */
function cleanInt(val: string | undefined): number {
  if (!val) return NaN
  return parseInt(val.replace(/[^\d]/g, ''), 10)
}

/**
 * Calculates the timezone offset in minutes for a given timezone and date.
 * Following the standard JS Date.getTimezoneOffset() sign convention:
 * - Returns positive values for zones behind UTC (e.g. America/New_York returns +240 or +300)
 * - Returns negative values for zones ahead of UTC (e.g. Africa/Johannesburg returns -120)
 * 
 * This dynamically adapts to daylight saving time changes based on the Date instance passed.
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    })

    const parts = formatter.formatToParts(date)
    const map = new Map(parts.map((p) => [p.type, p.value]))

    const year = cleanInt(map.get('year'))
    const month = cleanInt(map.get('month')) - 1
    const day = cleanInt(map.get('day'))
    const hour = cleanInt(map.get('hour'))
    const minute = cleanInt(map.get('minute'))
    const second = cleanInt(map.get('second'))

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute) || isNaN(second)) {
      throw new Error('Parsed component is NaN')
    }

    // Build UTC timestamp for the target timezone local digits
    const targetUTC = Date.UTC(year, month, day, hour, minute, second)
    const originalUTC = date.getTime()

    // offset (in ms) = Original UTC - Target UTC
    const diffMs = originalUTC - targetUTC
    return Math.round(diffMs / 60000)
  } catch (err) {
    console.warn(`[dateTime] Failed to compute offset for timezone "${timezone}". Falling back to browser local offset.`, err)
    return date.getTimezoneOffset()
  }
}

/**
 * Converts a specific local date/time of a business's timezone into a UTC Date object.
 * E.g., converting "2026-05-22 08:30" under "Africa/Johannesburg" to the exact UTC Date.
 */
export function localTimeToUTC(
  year: number,
  month: number, // 0-indexed
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): Date {
  // 1. Construct target digits on a UTC timeline first (as an approximation)
  const approxUTC = new Date(Date.UTC(year, month, day, hour, minute, second))

  // 2. Compute the timezone offset (in minutes) at this specific date/time
  const offsetMin = getTimezoneOffset(timezone, approxUTC)

  // 3. Shift the approximate UTC date by the offset to obtain the absolute UTC date
  // e.g. target UTC time = approxUTC + offsetMin
  return new Date(approxUTC.getTime() + offsetMin * 60000)
}

export interface LocalTimeParts {
  year: number
  month: number // 0-indexed
  day: number
  hour: number
  minute: number
  dayOfWeek: number // 0-6 (0 = Sunday, 6 = Saturday)
}

/**
 * Converts a UTC Date object into its separate date/time digits within the business's timezone.
 */
export function utcToLocalTimeParts(date: Date, timezone: string): LocalTimeParts {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })

    const parts = formatter.formatToParts(date)
    const map = new Map(parts.map((p) => [p.type, p.value]))

    const year = cleanInt(map.get('year'))
    const month = cleanInt(map.get('month')) - 1
    const day = cleanInt(map.get('day'))
    const hour = cleanInt(map.get('hour'))
    const minute = cleanInt(map.get('minute'))

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
      throw new Error('Parsed component is NaN')
    }

    // Calculate dayOfWeek using the local date digits on a neutral scale (UTC)
    const neutralDate = new Date(Date.UTC(year, month, day))
    const dayOfWeek = neutralDate.getUTCDay()

    return { year, month, day, hour, minute, dayOfWeek }
  } catch (err) {
    console.warn(`[dateTime] Failed to parse local time parts for timezone "${timezone}". Falling back to browser timezone.`, err)
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      dayOfWeek: date.getDay(),
    }
  }
}
