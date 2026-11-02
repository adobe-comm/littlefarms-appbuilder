const COLLECTION_REGULAR = 'littlefarms_delivery_regular'
const COLLECTION_SPECIAL = 'littlefarms_delivery_special'
const COLLECTION_BOOKINGS = 'littlefarms_delivery_bookings'

const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** Legacy DaysAvailabilityOptions: value 0 = Monday … 6 = Sunday */
const LEGACY_WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
]

const MORNING_SLOT_START = '11:00'
const MORNING_SLOT_END = '15:00'
const MORNING_CUTOFF = '12:00'
const EVENING_CUTOFF = '19:30'

const DEFAULT_TIMEZONE = 'Asia/Singapore'

const CACHE_PREFIX = 'delivery-slot.storefront'

module.exports = {
  COLLECTION_REGULAR,
  COLLECTION_SPECIAL,
  COLLECTION_BOOKINGS,
  WEEKDAY_NAMES,
  LEGACY_WEEKDAY_LABELS,
  MORNING_SLOT_START,
  MORNING_SLOT_END,
  MORNING_CUTOFF,
  EVENING_CUTOFF,
  DEFAULT_TIMEZONE,
  CACHE_PREFIX
}
