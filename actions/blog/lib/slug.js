function slugify (label) {
  const base = String(label || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'post'
}

function uniqueSlug (base, taken) {
  const root = slugify(base)
  if (!taken.has(root)) return root
  let suffix = 2
  while (taken.has(`${root}-${suffix}`)) suffix += 1
  return `${root}-${suffix}`
}

module.exports = {
  slugify,
  uniqueSlug
}
