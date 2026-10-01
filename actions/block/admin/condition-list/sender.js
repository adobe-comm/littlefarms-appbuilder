async function send (prepared) {
  return { presets: await prepared.store.list(prepared.scope) }
}

module.exports = { send }
