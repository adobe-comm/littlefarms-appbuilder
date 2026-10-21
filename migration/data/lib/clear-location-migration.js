const { openLocationDb } = require('../../../actions/location/lib/location-store')
const { openContentDb } = require('../../../actions/location/lib/content-store')

/**
 * Write-mode cleanup for location migration. Only deletes collections matching enabled datasets.
 * @param {object} params — Runtime / DB params
 * @param {{ locations?: boolean, services?: boolean, team?: boolean, gallery?: boolean }} scope
 */
async function clearLocationMigrationData (params, scope = {}) {
  const result = {
    locationsRemoved: 0,
    servicesRemoved: 0,
    teamRemoved: 0,
    galleryRemoved: 0
  }

  if (scope.locations) {
    const openedLocation = await openLocationDb(params)
    try {
      const locationResult = await openedLocation.locations.deleteMany({ type: 'location' })
      result.locationsRemoved = locationResult.deletedCount || 0
    } finally {
      await openedLocation.client.close()
    }
  }

  const contentScopes = [
    ['services', 'service', 'servicesRemoved'],
    ['team', 'team', 'teamRemoved'],
    ['gallery', 'gallery', 'galleryRemoved']
  ]

  const toDelete = contentScopes.filter(([key]) => scope[key])
  if (toDelete.length) {
    const openedContent = await openContentDb(params)
    try {
      for (const [, type, countKey] of toDelete) {
        const deleteResult = await openedContent.collection.deleteMany({ type })
        result[countKey] = deleteResult.deletedCount || 0
      }
    } finally {
      await openedContent.client.close()
    }
  }

  return result
}

module.exports = {
  clearLocationMigrationData
}
