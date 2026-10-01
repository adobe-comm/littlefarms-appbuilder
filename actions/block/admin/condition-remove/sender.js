async function send (prepared) {
  return prepared.store.remove(prepared.id)
}

module.exports = { send }
