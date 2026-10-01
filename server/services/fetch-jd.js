/**
 * Fetch a job posting URL and extract clean text from the HTML.
 *
 * The URL comes from a record any user or API key can write, so this fetch
 * is a server-side request to a caller-chosen address. It only ever connects
 * to public addresses: the check runs inside the socket's DNS lookup, so the
 * address that is checked is the address that is dialled (no rebinding
 * window), and redirects are followed by hand so every hop is checked again.
 */

const dns = require('dns')
const http = require('http')
const https = require('https')
const net = require('net')
const zlib = require('zlib')

const MAX_REDIRECTS = parseInt(process.env.JD_FETCH_MAX_REDIRECTS ?? '3', 10)
const TIMEOUT_MS = parseInt(process.env.JD_FETCH_TIMEOUT ?? '10000', 10)
const MAX_TEXT_LENGTH = 50000
const MAX_BODY_BYTES = 5 * 1024 * 1024
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const BLOCKED_CODE = 'EJDBLOCKED'

// Everything that is not the public internet: loopback, private, link-local,
// CGNAT, documentation, benchmarking, multicast and reserved ranges, plus the
// IPv6 transition prefixes that embed an IPv4 address (NAT64, 6to4, Teredo,
// IPv4-compatible, SIIT), which could otherwise smuggle a private one through.
// Two lists, because BlockList matches an IPv4 address against IPv6 subnets
// as its ::ffff: form, so one mixed list would put all of IPv4 in ::ffff:0:0/96.
const nonPublic4 = new net.BlockList()
const nonPublic6 = new net.BlockList()
for (const [prefix, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) nonPublic4.addSubnet(prefix, bits, 'ipv4')
for (const [prefix, bits] of [
  ['::', 96], ['::ffff:0:0', 96], ['::ffff:0:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48],
  ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
]) nonPublic6.addSubnet(prefix, bits, 'ipv6')

/**
 * True when an IP address is on the public internet. IPv4-mapped IPv6
 * (::ffff:a.b.c.d, in either notation) is judged by the IPv4 address inside.
 *
 * @param {string} address
 * @returns {boolean}
 */
function isPublicAddress(address) {
  const family = net.isIP(address)
  if (family === 4) return !nonPublic4.check(address, 'ipv4')
  if (family !== 6) return false

  const mapped = address.toLowerCase().match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/)
  if (mapped) {
    const v4 = mapped[1] ?? [mapped[2], mapped[3]]
      .map(h => parseInt(h, 16))
      .flatMap(n => [n >> 8, n & 255])
      .join('.')
    return isPublicAddress(v4)
  }
  return !nonPublic6.check(address, 'ipv6')
}

function blockedError() {
  const err = new Error('Refusing to connect to a non-public address')
  err.code = BLOCKED_CODE
  return err
}

/**
 * A dns.lookup replacement for http.request that refuses non-public
 * addresses. Handles both the single-address and `all: true` shapes, since
 * Node's happy-eyeballs connect asks for every address.
 */
function guardedLookup(isAllowed) {
  return (hostname, options, callback) => {
    dns.lookup(hostname, options, (err, address, family) => {
      if (err) return callback(err)
      const addresses = Array.isArray(address) ? address.map(a => a.address) : [address]
      if (!addresses.every(isAllowed)) return callback(blockedError())
      callback(null, address, family)
    })
  }
}

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
 * One GET, no redirect following. Resolves with the response; the caller
 * reads or discards the body.
 */
function request(url, { signal, isAllowed }) {
  // A literal IP never reaches the lookup hook, so it is checked here.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && !isAllowed(host)) return Promise.reject(blockedError())

  const transport = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: 'GET',
      signal,
      lookup: guardedLookup(isAllowed),
      agent: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }, resolve)
    req.on('error', reject)
    req.end()
  })
}

/**
 * Read a response body as UTF-8 text, decompressing it and giving up once it
 * passes MAX_BODY_BYTES.
 */
function readBody(response) {
  const decoders = {
    gzip: zlib.createGunzip,
    'x-gzip': zlib.createGunzip,
    deflate: zlib.createInflate,
    br: zlib.createBrotliDecompress,
  }
  const encoding = (response.headers['content-encoding'] || '').trim().toLowerCase()
  const stream = decoders[encoding] ? response.pipe(decoders[encoding]()) : response

  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    stream.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        response.destroy()
        stream.destroy()
        return reject(new FetchError('The page is too large to fetch. Paste the job description manually.', 'too_large'))
      }
      chunks.push(chunk)
    })
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
    response.on('error', reject)
  })
}

/**
 * Fetch a job posting URL and return clean text.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {(address: string) => boolean} [options.isAllowed] address check,
 *   public-only by default; tests widen it to reach a local server
 * @returns {Promise<string>}
 * @throws {FetchError}
 */
async function fetchJobDescription(url, { isAllowed = isPublicAddress } = {}) {
  console.log(`[fetch-jd] start url="${url}" timeout=${TIMEOUT_MS}ms max_redirects=${MAX_REDIRECTS}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let current
    try {
      current = new URL(url)
    } catch {
      throw new FetchError('The job posting URL is not valid.', 'invalid_url')
    }

    let response
    for (let hop = 0; ; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        throw new FetchError('The job posting URL must use http or https.', 'invalid_url')
      }
      response = await request(current, { signal: controller.signal, isAllowed })

      const location = response.headers.location
      if (!REDIRECT_STATUSES.has(response.statusCode) || !location) break

      response.resume()
      if (hop >= MAX_REDIRECTS) {
        throw new FetchError('The page redirected too many times. Paste the job description manually.', 'too_many_redirects')
      }
      try {
        current = new URL(location, current)
      } catch {
        throw new FetchError('The page redirected to an invalid URL.', 'invalid_url')
      }
    }

    const status = response.statusCode
    if (status < 200 || status >= 300) {
      response.resume()
      if (status === 403) {
        throw new FetchError('This site blocks automated access. Paste the job description manually.', 'anti_bot')
      }
      if (status === 404) {
        throw new FetchError('The page was not found. Check the URL.', 'not_found')
      }
      throw new FetchError(`The page returned an error (${status}). Try again later.`, 'http_error')
    }

    const contentType = response.headers['content-type'] || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      response.resume()
      throw new FetchError('The URL did not return HTML content.', 'wrong_format')
    }

    const html = await readBody(response)
    clearTimeout(timeoutId)
    const text = htmlToText(html)

    if (text.length < 50) {
      throw new FetchError('The page content was too short to extract a job description.', 'empty')
    }

    console.log(`[fetch-jd] success text_length=${text.length}`)
    return text
  } catch (err) {
    clearTimeout(timeoutId)

    if (err instanceof FetchError) {
      throw err
    }

    if (err.code === BLOCKED_CODE) {
      console.warn(`[fetch-jd] blocked non-public address url="${url}"`)
      throw new FetchError('This URL points to a private or local network address, which cannot be fetched.', 'blocked')
    }

    if (err.name === 'AbortError' || controller.signal.aborted) {
      throw new FetchError('The page took too long to respond. Try again or paste manually.', 'timeout')
    }

    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      throw new FetchError('Could not reach this page. Check the URL.', 'network')
    }

    console.error(`[fetch-jd] failed error="${err.message}"`)
    throw new FetchError('Could not fetch the job description. Paste it manually to extract details.', 'unknown')
  }
}

module.exports = { fetchJobDescription, FetchError, isPublicAddress }
