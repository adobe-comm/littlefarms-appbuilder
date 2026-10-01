async function send (prepared) {
  const preset = prepared.existing
    ? await prepared.store.replace(prepared.preset)
    : await prepared.store.insert(prepared.preset)
  return { preset }
}

module.exports = { send }
