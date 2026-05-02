/**
 * Fetch a job posting URL and extract clean text from the HTML.
 *
 * Uses Node.js built-in fetch (available in Node 18+). No external HTTP
 * dependencies needed.
 */

const MAX_REDIRECTS = parseInt(process.env.JD_FETCH_MAX_REDIRECTS ?? '3', 10)
const TIMEOUT_MS = parseInt(process.env.JD_FETCH_TIMEOUT ?? '10000', 10)
const MAX_TEXT_LENGTH = 50000

/**
 * Strip HTML tags, scripts, styles, and excessive whitespace.
 * Lightweight — no DOM parser needed for this use case.
 *
 * @param {string} html
 * @returns {string}
 */
function htmlToText(html) {
  // Remove script and style blocks first
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')       // Remove remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')        // Drop numeric entities
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .trim()

  // Truncate to avoid storing massive pages
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH) + '\n\n[truncated]'
  }

  return text
}

class FetchError extends Error {
  constructor(message, type) {
    super(message)
    this.type = type
  }
}

/**
 * Fetch a job posting URL and return clean text.
 *
 * @param {string} url
 * @returns {Promise<string>}
 * @throws {FetchError}
 */
async function fetchJobDescription(url) {
  console.log(`[fetch-jd] start url="${url}" timeout=${TIMEOUT_MS}ms max_redirects=${MAX_REDIRECTS}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 403) {
        throw new FetchError('This site blocks automated access. Paste the job description manually.', 'anti_bot')
      }
      if (response.status === 404) {
        throw new FetchError('The page was not found. Check the URL.', 'not_found')
      }
      throw new FetchError(`The page returned an error (${response.status}). Try again later.`, 'http_error')
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new FetchError('The URL did not return HTML content.', 'wrong_format')
    }

    const html = await response.text()
    const text = htmlToText(html)

    if (text.length < 50) {
      throw new FetchError('The page content was too short to extract a job description.', 'empty')
    }

    console.log(`[fetch-jd] success text_length=${text.length}`)
    return text
  } catch (err) {
    clearTimeout(timeoutId)

    if (err.name === 'AbortError') {
      throw new FetchError('The page took too long to respond. Try again or paste manually.', 'timeout')
    }

    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      throw new FetchError('Could not reach this page. Check the URL.', 'network')
    }

    if (err instanceof FetchError) {
      throw err
    }

    console.error(`[fetch-jd] failed error="${err.message}"`)
    throw new FetchError('Could not fetch the job description. Paste it manually to extract details.', 'unknown')
  }
}

module.exports = { fetchJobDescription, FetchError }
