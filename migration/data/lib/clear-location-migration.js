const { openLocationDb } = require('../../../actions/location/lib/location-store')
const { openContentDb } = require('../../../actions/location/lib/content-store')

/**
 * Remove location and linked content documents before a "write" migration.
 * Counters are kept; import bumps them after insert.
 */
async function clearLocationMigrationData (params) {
  const openedLocation = await openLocationDb(params)
  try {
    const locationResult = await openedLocation.locations.deleteMany({ type: 'location' })
    const openedContent = await openContentDb(params)
    try {
      const contentResult = await openedContent.collection.deleteMany({
        type: { $in: ['service', 'team', 'gallery'] }
      })
      return {
        locationsRemoved: locationResult.deletedCount || 0,
        contentRemoved: contentResult.deletedCount || 0
      }
    } finally {
      await openedContent.client.close()
    }
  } finally {
    await openedLocation.client.close()
  }
}

module.exports = {
  clearLocationMigrationData
}
