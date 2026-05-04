'use strict';

const extraction = require('./extraction');
const { ServiceError } = require('./applications');

const VALID_TASKS = ['cover_letter', 'resume_tailor', 'interview_prep'];

const PROMPTS = {
  cover_letter: `You are an expert career coach and writer. Write a compelling, tailored cover letter for the job application described below.

Use the candidate's profile (CV, career narrative, agent instructions) to personalise the letter. Reference specific skills and experiences that match the job requirements.

Rules:
- Output ONLY the cover letter text — no explanations, no markdown code blocks, no meta-commentary.
- Address the letter to the hiring manager (use "Dear Hiring Manager" if no name is known).
- Keep the tone professional but warm. If the candidate's agent_tone is specified, match it.
- Highlight 2-3 specific overlaps between the candidate's background and the job requirements.
- Keep the letter to 3-4 paragraphs (250-400 words).
- End with a confident call to action.`,

  resume_tailor: `You are an expert resume strategist. Based on the job description and the candidate's profile, provide specific, actionable suggestions for tailoring their resume for this application.

Rules:
- Output ONLY the suggestions — no explanations of why you're giving suggestions, no markdown code blocks.
- Format as a concise bullet list (5-10 bullets).
- Each bullet should be a specific, actionable change (e.g., "Move Kubernetes experience to the top of your skills list" or "Add a bullet under your Senior Engineer role quantifying API throughput").
- Reference specific keywords from the job description.
- Consider the candidate's agent_emphasize and agent_avoid preferences if provided.`,

  interview_prep: `You are an expert interview coach. Prepare a concise interview brief for the candidate based on the job description, their profile, and any stage notes.

Rules:
- Output ONLY the brief — no markdown code blocks, no meta-commentary.
- Include 3 sections: "Key Themes to Emphasise", "Likely Questions", and "Questions to Ask Them".
- "Key Themes to Emphasise": 3-5 bullet points linking the candidate's background to the role.
- "Likely Questions": 5-7 questions the interviewer might ask, based on the JD and the candidate's profile gaps.
- "Questions to Ask Them": 3-4 insightful questions the candidate should ask to demonstrate interest and evaluate fit.
- Keep the total brief under 500 words.`,
};

function buildContextMessage(context) {
  const parts = [];

  const app = context.application;
  if (app) {
    parts.push(`Company: ${app.company_name || 'Unknown'}`);
    parts.push(`Role: ${app.role_title || 'Unknown'}`);
    parts.push(`Location: ${app.location || 'Not specified'}`);
    parts.push(`Status: ${app.status || 'Unknown'}`);
  }

  if (context.job_description) {
    parts.push(`\nJob Description:\n${context.job_description}`);
  }

  if (context.profile) {
    const p = context.profile;
    parts.push(`\nCandidate Profile:`);
    if (p.full_name) parts.push(`Name: ${p.full_name}`);
    if (p.location_city || p.location_country) parts.push(`Location: ${[p.location_city, p.location_country].filter(Boolean).join(', ')}`);
    if (p.target_roles) parts.push(`Target roles: ${p.target_roles}`);
    if (p.cv_markdown) parts.push(`CV:\n${p.cv_markdown}`);
    if (p.career_narrative) parts.push(`Career narrative:\n${p.career_narrative}`);
    if (p.agent_tone) parts.push(`Preferred tone: ${p.agent_tone}`);
    if (p.agent_emphasize) parts.push(`Emphasise: ${p.agent_emphasize}`);
    if (p.agent_avoid) parts.push(`Avoid: ${p.agent_avoid}`);
    if (p.agent_instructions) parts.push(`Agent instructions:\n${p.agent_instructions}`);
  }

  if (context.notes && context.notes.length > 0) {
    parts.push(`\nStage Notes:`);
    for (const note of context.notes) {
      parts.push(`- [${note.stage}] ${note.content}`);
    }
  }

  if (context.attachments && context.attachments.length > 0) {
    const textAttachments = context.attachments.filter(a => a.extracted_text);
    if (textAttachments.length > 0) {
      parts.push(`\nAttachment Extracts:`);
      for (const att of textAttachments) {
        parts.push(`--- ${att.original_filename} ---\n${att.extracted_text}`);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Generate a tailored document for a job application.
 *
 * @param {object} context - Assembled context payload ({ application, notes, attachments, profile, job_description }).
 * @param {string} task - One of 'cover_letter', 'resume_tailor', 'interview_prep'.
 * @returns {Promise<string>} Generated document text.
 * @throws {ServiceError}
 */
async function generateDocument(context, task) {
  if (!VALID_TASKS.includes(task)) {
    throw new ServiceError(400, `Invalid task. Must be one of: ${VALID_TASKS.join(', ')}`);
  }

  const client = extraction.getOpenAIClient();
  if (!client) {
    console.error('[generation] failed reason="OPENAI_API_KEY not configured"');
    throw new ServiceError(503, 'Document generation is not available. OpenAI API key is not configured.');
  }

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const contextText = buildContextMessage(context);

  console.log(`[generation] start task="${task}" model="${model}" context_length=${contextText.length}`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: PROMPTS[task] },
        { role: 'user', content: contextText.slice(0, 20000) },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      console.error('[generation] failed reason="empty response from LLM"');
      throw new ServiceError(502, 'Generation failed. The LLM returned an empty response.');
    }

    console.log(`[generation] success task="${task}" length=${text.length}`);
    return text;
  } catch (err) {
    if (err instanceof ServiceError) throw err;

    console.error(`[generation] failed error="${err.message}"`);

    if (err.code === 'insufficient_quota' || err.status === 429) {
      throw new ServiceError(502, 'Generation failed due to rate limiting or quota exhaustion. Please try again later.');
    }
    if (err.code === 'context_length_exceeded') {
      throw new ServiceError(502, 'Generation failed because the context is too long for the model.');
    }

    throw new ServiceError(502, 'Generation failed due to an LLM service error. Please try again later.');
  }
}

module.exports = { generateDocument, VALID_TASKS };
