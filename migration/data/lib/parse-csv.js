const fs = require('fs')

/**
 * Minimal RFC 4180 CSV parser (quoted fields, embedded newlines).
 */
function parseCsv (text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r' && next === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  if (!rows.length) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).filter(cells => cells.some(cell => String(cell).trim() !== '')).map(cells => {
    const record = {}
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? ''
    })
    return record
  })
}

function readCsv (filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  return parseCsv(text)
}

module.exports = {
  parseCsv,
  readCsv
}
