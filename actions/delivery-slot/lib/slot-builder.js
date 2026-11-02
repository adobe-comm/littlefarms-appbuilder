const {
  LEGACY_WEEKDAY_LABELS,
  MORNING_SLOT_START,
  MORNING_SLOT_END,
  MORNING_CUTOFF,
  EVENING_CUTOFF,
  DEFAULT_TIMEZONE
} = require('./constants')
const { parseBookedMap } = require('./special-store')

function timezoneOf (params) {
  return String(params.DELIVERY_SLOT_TIMEZONE || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE
}

function zonedParts (date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'long'
  })
  const parts = fmt.formatToParts(date)
  const map = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return {
    ymd: `${map.year}-${map.month}-${map.day}`,
    hm: `${map.hour}:${map.minute}`,
    weekdayLong: map.weekday
  }
}

function addDaysYmd (ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function weekdayKeyFromLong (name) {
  return String(name || '').trim().toLowerCase()
}

function legacyIndexForWeekdayLong (weekdayLong) {
  const idx = LEGACY_WEEKDAY_LABELS.findIndex(
    label => label.toLowerCase() === String(weekdayLong).toLowerCase()
  )
  return idx >= 0 ? String(idx) : null
}

function rowToLegacySlot (row, bookedOverride) {
  const booked = bookedOverride != null ? bookedOverride : Number(row.bookedCount) || 0
  const maxUser = Number(row.maxUser) || 0
  return {
    start_time: row.startTime,
    end_time: row.endTime,
    max_user: String(maxUser),
    booked_count: String(booked),
    remaining: Math.max(0, maxUser - booked)
  }
}

function filterAvailableRegularSlots (rows) {
  return (rows || [])
    .map(row => rowToLegacySlot(row))
    .filter(slot => slot.remaining > 0)
}

function cutoffFlags (currentHm) {
  const showTodayNoon = currentHm >= '00:00' && currentHm < MORNING_CUTOFF
  let showNextDayNoon = false
  let showNextDayFull = false
  if (currentHm >= MORNING_CUTOFF && currentHm < EVENING_CUTOFF) {
    showNextDayFull = true
  } else if (currentHm >= EVENING_CUTOFF && currentHm <= '23:59') {
    showNextDayNoon = true
  } else if (showTodayNoon) {
    showNextDayFull = true
  }
  return { showTodayNoon, showNextDayNoon, showNextDayFull }
}

function applyTodayTomorrowCutoffs (timeSlots, dayIndex, flags) {
  let slots = [...timeSlots]
  if (dayIndex === 0) {
    if (flags.showTodayNoon) {
      slots = slots.filter(slot => {
        const start = slot.start_time
        return !(start >= MORNING_SLOT_START && start < MORNING_SLOT_END)
      })
    } else {
      slots = []
    }
  }
  if (dayIndex === 1) {
    if (flags.showNextDayNoon) {
      slots = slots.filter(slot => {
        const start = slot.start_time
        return !(start >= MORNING_SLOT_START && start < MORNING_SLOT_END)
      })
    } else if (!flags.showNextDayFull) {
      slots = []
    }
  }
  return slots
}

function buildRegularDaySlots ({
  regularConfig,
  availableDayIndexes,
  savedDeliveryDateTime,
  savedDeliveryDateTimeSlot,
  now = new Date(),
  timeZone
}) {
  const tz = timeZone || DEFAULT_TIMEZONE
  const current = zonedParts(now, tz)
  const flags = cutoffFlags(current.hm)
  const sortedDays = []
  const months = []
  const years = []

  for (let i = 0; i < 7; i++) {
    const ymd = addDaysYmd(current.ymd, i)
    const probe = new Date(`${ymd}T12:00:00Z`)
    const weekdayLong = zonedParts(probe, tz).weekdayLong
    const weekdayKey = weekdayKeyFromLong(weekdayLong)
    const legacyIdx = legacyIndexForWeekdayLong(weekdayLong)
    const monthName = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' }).format(probe)
    const yearName = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(probe)
    months.push(monthName)
    years.push(yearName)

    let timeSlots = filterAvailableRegularSlots(regularConfig.weekdays[weekdayKey])
    timeSlots = applyTodayTomorrowCutoffs(timeSlots, i, flags)

    const dayNumber = ymd.slice(-2)
    const sortName = i === 0 ? 'Today' : new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(probe)
    const isActive = legacyIdx != null &&
      availableDayIndexes.includes(legacyIdx) &&
      timeSlots.length > 0

    sortedDays.push({
      sort_name: sortName,
      value: ymd,
      day_number: dayNumber,
      is_active: isActive,
      time_slot: timeSlots
    })
  }

  const uniqueMonths = [...new Set(months)]
  const uniqueYears = [...new Set(years)]
  const dateLabel = `${uniqueMonths.join(' - ')}, ${uniqueYears.join(' - ')}`
  const validation = validateSavedSlot(
    savedDeliveryDateTime,
    savedDeliveryDateTimeSlot,
    current.ymd,
    sortedDays
  )

  return {
    path: 'regular',
    date: dateLabel,
    selectedDay: validation.selectedDay,
    selectedTime: validation.selectedTime,
    selectedTimeValid: validation.selectedTimeValid,
    daySlot: sortedDays,
    deliveryDateAndTime: validation.deliveryDateAndTime
  }
}

function bookedForSpecialDate (row, ymd) {
  const map = parseBookedMap(row.bookedByDate)
  return Number(map[ymd]) || 0
}

function buildSpecialDaySlots ({
  specialConfig,
  availableDayIndexes,
  categoryIds,
  offsetDeliveryFlag,
  savedDeliveryDateTime,
  savedDeliveryDateTimeSlot,
  now = new Date(),
  timeZone,
  isOrderWindowActive,
  maxDeliveryOffsetForCart
}) {
  const tz = timeZone || DEFAULT_TIMEZONE
  const currentYmd = zonedParts(now, tz).ymd
  if (!isOrderWindowActive(specialConfig, currentYmd)) {
    return { path: 'special', empty: true, daySlot: [] }
  }

  let deliveryOffset = maxDeliveryOffsetForCart(specialConfig, categoryIds)
  let deliveryStartYmd = addDaysYmd(currentYmd, deliveryOffset)
  let orderEndYmd = specialConfig.orderEndDate
  let deliveryEndYmd = addDaysYmd(orderEndYmd, deliveryOffset)

  if (offsetDeliveryFlag) {
    deliveryStartYmd = addDaysYmd(currentYmd, deliveryOffset)
    deliveryEndYmd = addDaysYmd(currentYmd, 6)
  }

  const startMs = Date.parse(`${deliveryStartYmd}T00:00:00Z`)
  const endMs = Date.parse(`${deliveryEndYmd}T00:00:00Z`)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return { path: 'special', empty: true, daySlot: [] }
  }
  const totalDays = Math.round((endMs - startMs) / 86400000)

  const sortedDays = []
  const months = []
  const years = []

  for (let i = 0; i <= totalDays; i++) {
    const ymd = addDaysYmd(deliveryStartYmd, i)
    const probe = new Date(`${ymd}T12:00:00Z`)
    const weekdayLong = zonedParts(probe, tz).weekdayLong
    const weekdayKey = weekdayKeyFromLong(weekdayLong)
    const legacyIdx = legacyIndexForWeekdayLong(weekdayLong)
    months.push(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' }).format(probe))
    years.push(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(probe))

    const rows = specialConfig.weekdays[weekdayKey] || []
    const timeSlots = rows
      .map(row => {
        const booked = bookedForSpecialDate(row, ymd)
        const legacy = rowToLegacySlot(row, booked)
        return legacy.remaining > 0 ? legacy : null
      })
      .filter(Boolean)

    sortedDays.push({
      sort_name: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(probe),
      value: ymd,
      day_number: ymd.slice(-2),
      is_active: legacyIdx != null && availableDayIndexes.includes(legacyIdx) && timeSlots.length > 0,
      time_slot: timeSlots
    })
  }

  const validation = validateSavedSlot(
    savedDeliveryDateTime,
    savedDeliveryDateTimeSlot,
    deliveryStartYmd,
    sortedDays
  )

  const uniqueMonths = [...new Set(months)]
  const uniqueYears = [...new Set(years)]

  return {
    path: 'special',
    empty: false,
    date: `${uniqueMonths.join(' - ')}, ${uniqueYears.join(' - ')}`,
    selectedDay: validation.selectedDay,
    selectedTime: validation.selectedTime,
    selectedTimeValid: validation.selectedTimeValid,
    daySlot: sortedDays,
    daysDataForCheck: sortedDays,
    deliveryDateAndTime: validation.deliveryDateAndTime
  }
}

function validateSavedSlot (deliveryDateTime, deliverySlotLabel, compareYmd, daySlots) {
  if (!deliveryDateTime) {
    return {
      selectedDay: '',
      selectedTime: '',
      selectedTimeValid: 2,
      deliveryDateAndTime: ''
    }
  }
  const dt = String(deliveryDateTime).trim()
  const dayYmd = dt.length >= 10 ? dt.slice(0, 10) : dt
  if (compareYmd && dayYmd < compareYmd) {
    return {
      selectedDay: '',
      selectedTime: '',
      selectedTimeValid: 0,
      deliveryDateAndTime: ''
    }
  }
  const slotLabel = String(deliverySlotLabel || '').trim()
  let startHm = ''
  if (dt.includes(' ')) {
    startHm = dt.split(' ')[1]?.slice(0, 5) || ''
  }
  let matched = false
  for (const day of daySlots || []) {
    if (day.value !== dayYmd) continue
    for (const slot of day.time_slot || []) {
      if (slot.start_time === startHm || slotLabel.includes(slot.start_time)) {
        matched = true
      }
    }
  }
  const valid = matched ? 1 : 0
  return {
    selectedDay: valid ? dayYmd : '',
    selectedTime: valid ? slotLabel : '',
    selectedTimeValid: valid,
    deliveryDateAndTime: valid && slotLabel ? `${dayYmd} (${slotLabel})` : ''
  }
}

function detectMixedCartBlock (specialActive, cartInSpecialCategories) {
  if (specialActive && cartInSpecialCategories === 'mixed') {
    return {
      mixedCartBlocked: true,
      message: 'Your cart contains both special-event and regular items. Remove one type to choose a delivery slot.'
    }
  }
  return { mixedCartBlocked: false, message: '' }
}

module.exports = {
  timezoneOf,
  buildRegularDaySlots,
  buildSpecialDaySlots,
  validateSavedSlot,
  detectMixedCartBlock,
  zonedParts,
  weekdayKeyFromLong
}
