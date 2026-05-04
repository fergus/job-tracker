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

// ─── Structured Job Description Extraction (LLM-based) ──────────────────────

let OpenAI
let openaiClient = null

try { OpenAI = require('openai') } catch { /* optional dep */ }

function getOpenAIClient() {
  if (!openaiClient && OpenAI) {
    const apiKey = process.env.OPENAI_API_KEY
    if (apiKey) {
      openaiClient = new OpenAI({ apiKey })
    }
  }
  return openaiClient
}

const EXTRACTION_PROMPT = `You are a precise job description parser. Extract structured information from the following job description text.

Return ONLY a JSON object with this exact shape:
{
  "required_skills": ["string"],
  "responsibilities": ["string"],
  "experience_requirements": ["string"],
  "salary_signals": { "min": number|null, "max": number|null, "currency": string|null, "period": string|null },
  "location": string|null,
  "employment_type": string|null,
  "seniority_level": string|null
}

Rules:
- required_skills: technical skills, tools, languages, frameworks, certifications. Exclude soft skills.
- responsibilities: key duties and deliverables. Keep each to one concise sentence.
- experience_requirements: years of experience, education, or domain-specific prerequisites.
- salary_signals: if the JD mentions a range (e.g. "$150K-$200K"), parse min and max as numbers. Currency is a 3-letter code (USD, EUR, GBP). Period is "year", "month", or "hour".
- location: the work location (city, country, or "Remote"). Null if not mentioned.
- employment_type: "Full-time", "Part-time", "Contract", "Internship", or similar. Null if unclear.
- seniority_level: "Junior", "Mid-level", "Senior", "Staff", "Principal", "Lead", etc. Infer from context if not explicit.
- If a field has no relevant information, use an empty array (for lists) or null (for scalars).
- Do NOT include markdown formatting, explanations, or anything outside the JSON object.`

/**
 * Extract structured job description data from raw text using an LLM.
 *
 * @param {string} text - Raw job description text.
 * @returns {Promise<object|null>} Structured data or null on failure.
 */
async function extractStructuredJD(text) {
  const client = getOpenAIClient()
  if (!client) {
    console.error('[jd-extraction] failed reason="OPENAI_API_KEY not configured"')
    return null
  }

  const model = process.env.LLM_MODEL || 'gpt-4o-mini'

  console.log(`[jd-extraction] start model="${model}" text_length=${text.length}`)

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: text.slice(0, 15000) }, // Cap to manage token usage
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500,
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) {
      console.error('[jd-extraction] failed reason="empty response from LLM"')
      return null
    }

    const parsed = JSON.parse(raw)

    // Normalize and validate shape
    const result = {
      required_skills: Array.isArray(parsed.required_skills) ? parsed.required_skills.filter(Boolean) : [],
      responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities.filter(Boolean) : [],
      experience_requirements: Array.isArray(parsed.experience_requirements) ? parsed.experience_requirements.filter(Boolean) : [],
      salary_signals: parsed.salary_signals && typeof parsed.salary_signals === 'object'
        ? {
            min: typeof parsed.salary_signals.min === 'number' ? parsed.salary_signals.min : null,
            max: typeof parsed.salary_signals.max === 'number' ? parsed.salary_signals.max : null,
            currency: typeof parsed.salary_signals.currency === 'string' ? parsed.salary_signals.currency : null,
            period: typeof parsed.salary_signals.period === 'string' ? parsed.salary_signals.period : null,
          }
        : { min: null, max: null, currency: null, period: null },
      location: typeof parsed.location === 'string' ? parsed.location : null,
      employment_type: typeof parsed.employment_type === 'string' ? parsed.employment_type : null,
      seniority_level: typeof parsed.seniority_level === 'string' ? parsed.seniority_level : null,
    }

    console.log(`[jd-extraction] success skills=${result.required_skills.length} responsibilities=${result.responsibilities.length}`)
    return result
  } catch (err) {
    console.error(`[jd-extraction] failed error="${err.message}"`)
    return null
  }
}

module.exports = { extractText, extractStructuredJD, getOpenAIClient }
