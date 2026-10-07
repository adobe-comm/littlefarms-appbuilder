const BRANDS_COLLECTION = 'littlefarms_brands'
const BRAND_SETTINGS_COLLECTION = 'littlefarms_brand_settings'
const ALL_STORE_VIEWS = 'all'
const DEFAULT_STORE_VIEW = 'default'
const PAGE_SIZE = 50
const MAX_PAGE_SIZE = 50
const DEFAULT_BRAND_CACHE_TTL = 600

const BOOLEAN_FIELDS = [
  'is_active',
  'is_new_brand',
  'is_top_brand',
  'is_featured',
  'show_in_brand_list_widget',
  'show_in_brand_slider_widget'
]

const TEXT_FIELDS = [
  'url_alias',
  'meta_title',
  'meta_description',
  'meta_keywords',
  'page_title',
  'description',
  'short_description',
  'image',
  'image_alt',
  'small_image',
  'small_image_alt'
]

const USE_DEFAULT_FIELDS = ['meta_title', 'page_title']

const FIELD_DEFAULTS = {
  is_active: true,
  is_new_brand: false,
  is_top_brand: false,
  is_featured: false,
  show_in_brand_list_widget: true,
  show_in_brand_slider_widget: false,
  slider_position: 0,
  url_alias: '',
  meta_title: '',
  meta_description: '',
  meta_keywords: '',
  page_title: '',
  description: '',
  short_description: '',
  image: '',
  image_alt: '',
  small_image: '',
  small_image_alt: '',
  meta_title_use_default: true,
  page_title_use_default: true
}

module.exports = {
  BRANDS_COLLECTION,
  BRAND_SETTINGS_COLLECTION,
  ALL_STORE_VIEWS,
  DEFAULT_STORE_VIEW,
  PAGE_SIZE,
  MAX_PAGE_SIZE,
  DEFAULT_BRAND_CACHE_TTL,
  BOOLEAN_FIELDS,
  TEXT_FIELDS,
  USE_DEFAULT_FIELDS,
  FIELD_DEFAULTS
}
