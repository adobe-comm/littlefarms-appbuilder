async function send (prepared) {
  const existing = await prepared.store.get(prepared.rule.id)
  const rule = existing
    ? await prepared.store.replace(prepared.rule)
    : await prepared.store.insert(prepared.rule)
  return { rule }
}

module.exports = { send }
