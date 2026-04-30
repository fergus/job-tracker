const fs = require('fs')
const path = require('path')

let pdfParse, mammoth

try { pdfParse = require('pdf-parse') } catch { /* optional dep */ }
try { mammoth = require('mammoth') } catch { /* optional dep */ }

const MIME_MAP = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

/**
 * Extract plain text from a file based on its extension / MIME type.
 * Returns null for unsupported types or extraction failures.
 *
 * Diagnostic logs are written to stdout for every attempt so operators can
 * trace extraction behaviour (especially important during backfill migrations).
 *
 * @param {string} filePath - Absolute path to the file on disk.
 * @param {string} mimeType - Optional MIME type hint.
 * @param {object} meta - Optional metadata for log context (e.g. { attachmentId }).
 * @returns {Promise<string|null>} Extracted text or null.
 */
async function extractText(filePath, mimeType, meta = {}) {
  const ext = path.extname(filePath).toLowerCase()
  const effectiveMime = mimeType || MIME_MAP[ext]
  const logPrefix = meta.attachmentId !== undefined
    ? `[extraction][id=${meta.attachmentId}]`
    : `[extraction]`

  console.log(`${logPrefix} start path="${filePath}" ext="${ext}" mime="${effectiveMime || 'unknown'}"`)

  try {
    if (effectiveMime === 'application/pdf' && pdfParse) {
      const dataBuffer = fs.readFileSync(filePath)
      const parser = new pdfParse.PDFParse({ data: dataBuffer })
      const result = await parser.getText()
      const text = result.text || null
      if (text) {
        console.log(`${logPrefix} success format=pdf length=${text.length}`)
      } else {
        console.log(`${logPrefix} success format=pdf length=0 (empty document)`)
      }
      return text
    }

    if ((ext === '.docx' || effectiveMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') && mammoth) {
      const result = await mammoth.extractRawText({ path: filePath })
      const text = result.value || null
      if (text) {
        console.log(`${logPrefix} success format=docx length=${text.length}`)
      } else {
        console.log(`${logPrefix} success format=docx length=0 (empty document)`)
      }
      return text
    }

    if (ext === '.doc' && mammoth) {
      const result = await mammoth.extractRawText({ path: filePath })
      const text = result.value || null
      if (text) {
        console.log(`${logPrefix} success format=doc length=${text.length}`)
      } else {
        console.log(`${logPrefix} success format=doc length=0 (empty document)`)
      }
      return text
    }

    if (ext === '.txt' || ext === '.md' || effectiveMime === 'text/plain' || effectiveMime === 'text/markdown') {
      const text = fs.readFileSync(filePath, 'utf-8') || null
      if (text) {
        console.log(`${logPrefix} success format=text length=${text.length}`)
      } else {
        console.log(`${logPrefix} success format=text length=0 (empty file)`)
      }
      return text
    }

    console.log(`${logPrefix} skipped reason="unsupported type" ext="${ext}" mime="${effectiveMime || 'unknown'}"`)
    return null
  } catch (err) {
    console.error(`${logPrefix} failed error="${err.message}"`)
    return null
  }
}

module.exports = { extractText }
