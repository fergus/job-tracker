# What leaves your server

Your records, notes, contacts and attachments are stored in `./data/` and `./uploads/` on your own host. With the default configuration and no agent connected, the app makes no calls to any AI provider.

Data leaves the server only through the flows below. Each one is opt-in.

## 1. An MCP agent you connect

**When:** you create an API key and connect an MCP client such as Claude Code.

**What:** whatever the agent reads through the tools: records, notes, contacts, attachment text and your profile. The agent passes it to its own model provider, under that provider's terms. Job Tracker cannot see or control what happens after that.

**Turn it off:** revoke the key in **Settings → API keys**.

## 2. Server-side LLM features (OpenAI)

**When:** the operator sets `OPENAI_API_KEY` for the container. It is unset by default, and `docker-compose.yml` does not pass it through (see [install](install.md#optional-llm-features)).

**What is sent to the OpenAI API:**

- **Job description extraction:** the stored job description text. This runs when you extract a description, and automatically after fetching one from a posting URL.
- **Document generation** (cover letter, CV tailoring, interview prep): the company, role, location, stage and close reason; the job description; your profile (name, location, target roles, CV, career narrative and agent instructions); the stage notes; and text extracted from the role's attachments. It is cut off at 20,000 characters.

The model is `LLM_MODEL`, default `gpt-4o-mini`.

**Turn it off:** leave `OPENAI_API_KEY` unset. Extraction and generation then report that they are not configured, fetching a posting still stores the text, and nothing else is affected.

## 3. Fetching a job posting

**When:** you, or an agent, ask to fetch the description from a role's posting URL.

**What:** a plain HTTP request to that URL, from your server. Only public addresses are reachable: private, loopback and link-local targets are refused on every redirect hop. Nothing about you is sent beyond what any web request carries.

## 4. iPhone contacts (CardDAV)

**When:** you create a phone key in **Settings → iPhone contacts** and add the account on a phone.

**What:** the phone pulls the people who have an email or phone number, with name, role, employer, email, phone and LinkedIn link. The data goes from your server to your phone, and nowhere else. See [People on your iPhone](iphone-contacts.md).

**Turn it off:** revoke the phone key.
