async function send (prepared) {
  const result = await prepared.store.remove(prepared.rule.id)
  if (result.deletedCount !== 1) {
    const error = new Error('Rule could not be deleted.')
    error.statusCode = 503
    throw error
  }
  return { deleted: true, rule: prepared.rule }
}

module.exports = { send }
