/** Migration services exposed in Commerce Admin → Settings. */

const LOCATION_DATASETS = {
  locations: {
    id: 'locations',
    label: 'Locations',
    description: 'Store locator rows (Location_data_1.csv)',
    fileKind: 'locations'
  },
  services: {
    id: 'services',
    label: 'Services',
    description: 'Location services (Location_service_data.csv)',
    fileKind: 'services'
  },
  team: {
    id: 'team',
    label: 'Team profiles',
    description: 'Team profiles (Team_data_store_locator.csv)',
    fileKind: 'team'
  },
  gallery: {
    id: 'gallery',
    label: 'Gallery',
    description: 'Gallery images (location_gallery.csv)',
    fileKind: 'gallery'
  }
}

const BLOG_DATASETS = {
  categories: {
    id: 'categories',
    label: 'Categories',
    description: 'Blog categories (Blog_category.csv)',
    fileKind: 'categories'
  },
  tags: {
    id: 'tags',
    label: 'Tags',
    description: 'Blog tags (Blog_post_tag.csv)',
    fileKind: 'tags'
  },
  posts: {
    id: 'posts',
    label: 'Posts',
    description: 'Blog posts (Blog.csv)',
    fileKind: 'posts'
  }
}

const BRAND_DATASETS = {
  options: {
    id: 'options',
    label: 'Brand options',
    description: 'Brand option content (Brand_Option_data.csv)',
    fileKind: 'brand-options'
  }
}

const SERVICES = {
  brand: {
    id: 'brand',
    label: 'Brands',
    allowWrite: false,
    datasets: BRAND_DATASETS,
    phases: ['brands']
  },
  location: {
    id: 'location',
    label: 'Locations',
    allowWrite: true,
    datasets: LOCATION_DATASETS,
    phases: ['cleanup', 'services', 'team', 'gallery', 'locations']
  },
  blog: {
    id: 'blog',
    label: 'Blog',
    allowWrite: true,
    datasets: BLOG_DATASETS,
    phases: ['cleanup', 'categories', 'tags', 'posts']
  }
}

const DEFAULT_DATASETS = {
  brand: { options: false },
  location: { locations: false, services: false, team: false, gallery: false },
  blog: { categories: false, tags: false, posts: false }
}

const SERVICE_ORDER = ['brand', 'location', 'blog']

function listServices () {
  return SERVICE_ORDER.map(id => SERVICES[id]).filter(Boolean).map(service => ({
    id: service.id,
    label: service.label,
    allowWrite: service.allowWrite,
    defaultDatasets: defaultDatasets(service.id),
    datasets: Object.values(service.datasets).map(dataset => ({
      id: dataset.id,
      label: dataset.label,
      description: dataset.description,
      fileKind: dataset.fileKind
    }))
  }))
}

function getService (serviceId) {
  return SERVICES[String(serviceId || '').trim()] || null
}

function defaultDatasets (serviceId) {
  const defaults = DEFAULT_DATASETS[String(serviceId || '').trim()]
  if (!defaults) return null
  return { ...defaults }
}

function normalizeDatasets (serviceId, raw) {
  const service = getService(serviceId)
  if (!service) return null
  const input = raw && typeof raw === 'object' ? raw : {}
  const datasets = {}
  for (const key of Object.keys(service.datasets)) {
    datasets[key] = Boolean(input[key])
  }
  return datasets
}

function serviceAllowsWrite (serviceId) {
  return Boolean(getService(serviceId)?.allowWrite)
}

module.exports = {
  SERVICES,
  listServices,
  getService,
  defaultDatasets,
  normalizeDatasets,
  serviceAllowsWrite
}
