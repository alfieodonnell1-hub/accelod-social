const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'post-state.json');
const TEMP_DIR = path.join(ROOT, 'temp');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { status: 'idle' }; }
}

function writeState(updates) {
  const next = { ...readState(), ...updates, last_updated: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

async function callN8n(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Uploads to imgbb with API key — authenticated uploads are permanent (no expiry)
async function uploadImage(imagePath) {
  const base64 = fs.readFileSync(imagePath, { encoding: 'base64' });
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image: base64 }).toString()
  });
  const data = await res.json();
  if (!data.success) throw new Error('imgbb upload failed: ' + JSON.stringify(data.error));
  return data.data.url;
}

async function claude(prompt, maxTokens = 8192) {
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  });
  return msg.content[0].text;
}

function parseJSON(text, context) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in response');
    return JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`JSON parse failed in ${context}: ${e.message}`);
  }
}

async function generateIdeas() {
  const raw = await claude(`Generate 3 social media post ideas for Accelod, an AI automation consultancy run by Alfie O'Donnell.
Target audience: business owners and entrepreneurs who want to automate.
Brand voice: confident, direct, no fluff, slightly edgy.
Tools featured: Claude AI, N8N, GoHighLevel, Google Workspace.

Return ONLY valid JSON:
{
  "ideas": [
    { "number": 1, "title": "Short punchy title", "concept": "2-3 sentence description of the post concept and what the visual would show", "hook": "Opening line that grabs attention" },
    { "number": 2, "title": "...", "concept": "...", "hook": "..." },
    { "number": 3, "title": "...", "concept": "...", "hook": "..." }
  ]
}`, 4096);
  return parseJSON(raw, 'generateIdeas');
}

async function generatePostHTML(concept, platform) {
  const isIg = platform === 'instagram';
  const raw = await claude(`Generate a complete self-contained HTML social media post for Accelod AI.

CONCEPT: ${concept.title} — ${concept.concept}
HOOK: ${concept.hook}
PLATFORM: ${platform} — canvas exactly ${isIg ? '1080px x 1350px' : '1200px x 630px'}, element id="post"
LAYOUT: ${isIg
  ? 'Vertical stack: badge > headline > subtitle > content panel > CTA pill + logo'
  : 'Left column (360px): badge + headline + subtitle + CTA pill + logo | Right panel (flex:1): dark content panel (#06101A) filled with 3-5 concrete stats, bullet points, or before/after items pulled directly from the concept — this panel must NEVER be empty'}

BRAND RULES (follow exactly):
- Background: #0B1929. Accents: #00D4FF and #33E1FF
- Google Fonts CDN: Outfit 900/700/400, DM Sans 500/400, JetBrains Mono 500/400
- Claude 12-spoke asterisk SVG <symbol id="claude-star"> used as: bg watermark top-right (opacity 0.05, rotate 12deg) AND badge icon
- Badge: inline-flex, cyan border pill, "AI Automation" text + asterisk icon
- Headline: Outfit 900, white with key word in cyan gradient (em tag + webkit-background-clip)
- CTA pill: soft engagement question e.g. "Sound familiar?" or "Doing this manually?" — NEVER a sales line
- Accelod logo: bottom right, gradient #00D4FF to #33E1FF, opacity 1, clearly visible
- Body text min 20px. Key values min 26px bold. Headline: ${isIg ? '82px' : '58px'}+
- Content panel: bg #06101A, 1px solid rgba(0,212,255,0.2), border-radius 16px
- Dot-grid radial texture bg + top-left radial glow element
- Include export PNG button + dom-to-image-more@3.3.0 CDN script

Return ONLY the complete HTML file — no markdown, no code fences, no explanation.`);
  return raw;
}

async function takeScreenshot(html, outPath) {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  const tmp = path.join(TEMP_DIR, 'post.html');
  fs.writeFileSync(tmp, html);
  execSync(`node "${path.join(__dirname, 'screenshot-cloud.js')}" "${tmp}" "${outPath}"`, { stdio: 'inherit' });
  if (!fs.existsSync(outPath)) throw new Error(`Screenshot failed: ${outPath} was not created`);
}

async function sendPreviewEmail(igUrl, fbUrl, version, amendNote, igPath, fbPath) {
  const note = amendNote ? `<p style="color:#666"><em>Changes applied: ${amendNote}</em></p>` : '';
  // Resize to small JPEGs before embedding — keeps email under Gmail's 102KB clip limit
  const igJpg = igPath ? igPath.replace('.png', '-email.jpg') : null;
  const fbJpg = fbPath ? fbPath.replace('.png', '-email.jpg') : null;
  if (igPath && fs.existsSync(igPath)) execSync(`convert "${igPath}" -resize 480x -quality 55 "${igJpg}"`);
  if (fbPath && fs.existsSync(fbPath)) execSync(`convert "${fbPath}" -resize 560x -quality 55 "${fbJpg}"`);
  const igSrc = (igJpg && fs.existsSync(igJpg)) ? `data:image/jpeg;base64,${fs.readFileSync(igJpg, { encoding: 'base64' })}` : igUrl;
  const fbSrc = (fbJpg && fs.existsSync(fbJpg)) ? `data:image/jpeg;base64,${fs.readFileSync(fbJpg, { encoding: 'base64' })}` : fbUrl;
  await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
    subject: `Re: Accelod Post Options – ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} – Preview v${version}`,
    htmlBody: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px">
      <h2 style="color:#0B1929">Your post preview — v${version}</h2>
      ${note}
      <h3>Instagram (1080×1350)</h3>
      <img src="${igSrc}" style="width:100%;max-width:540px;border-radius:8px;display:block;margin-bottom:16px"/>
      <h3>Facebook (1200×630)</h3>
      <img src="${fbSrc}" style="width:100%;max-width:640px;border-radius:8px;display:block;margin-bottom:24px"/>
      <p>Reply with any changes — or say <strong>“post it”</strong> to publish to both platforms.</p>
    </div>`
  });
}

async function handleResendPreview() {
  const state = readState();
  if (state.status !== 'awaiting_approval') {
    console.log('No preview to resend — state is', state.status);
    return;
  }
  if (!state.ig_html || !state.fb_html) throw new Error('State is missing HTML — cannot resend preview');
  const igPath = path.join(TEMP_DIR, 'ig.png');
  const fbPath = path.join(TEMP_DIR, 'fb.png');
  console.log('Re-rendering stored HTML for resend...');
  await takeScreenshot(state.ig_html, igPath);
  await takeScreenshot(state.fb_html, fbPath);
  await sendPreviewEmail(state.ig_url, state.fb_url, state.version, null, igPath, fbPath);
  console.log('Preview email resent for v' + state.version);
}

async function handleSchedule() {
  const state = readState();
  if (state.status !== 'idle') {
    console.log('Post already in progress (' + state.status + ') — skipping scheduled run.');
    return;
  }
  console.log('Generating ideas...');
  const { ideas } = await generateIdeas();

  await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
    subject: `Accelod Post Options – ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    htmlBody: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#0B1929">Your Accelod post ideas for this week:</h2>
      ${ideas.map(i => `
        <div style="margin-bottom:20px;padding:20px;border:2px solid #00D4FF;border-radius:12px;background:#f8f9fa">
          <h3 style="margin:0 0 8px;color:#0B1929">${i.number}. ${i.title}</h3>
          <p style="margin:0 0 8px;color:#444">${i.concept}</p>
          <p style="margin:0;font-style:italic;color:#0088C8"><strong>Hook:</strong> "${i.hook}"</p>
        </div>`).join('')}
      <p style="margin-top:24px">Reply with <strong>1</strong>, <strong>2</strong>, or <strong>3</strong> — or just tell me which one you like. Add <strong>“video”</strong> if you want a video version.</p>
    </div>`
  });

  writeState({ status: 'awaiting_choice', ideas, version: 0 });
  console.log('Ideas emailed successfully.');
}

async function handleEmailReply(emailBody) {
  const state = readState();
  console.log('State:', state.status, '| Reply preview:', emailBody.slice(0, 80));

  if (state.status === 'awaiting_choice') {
    if (!Array.isArray(state.ideas)) throw new Error('State is missing ideas array');

    const parsed = parseJSON(
      await claude(`User received 3 post ideas and replied: "${emailBody}"
Ideas: ${state.ideas.map(i => `${i.number}. ${i.title}`).join(', ')}
Which did they pick? Did they mention video?
Return ONLY JSON: { "choice": 1|2|3, "wantsVideo": true|false }`, 512),
      'choice parse'
    );

    const chosen = state.ideas.find(i => i.number === parsed.choice);
    if (!chosen) {
      await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
        subject: 'Re: Accelod Post Options – Which one?',
        htmlBody: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <p>Couldn't work out which idea you meant. Reply with <strong>1</strong>, <strong>2</strong>, or <strong>3</strong> to pick one.</p>
          ${state.ideas.map(i => `<p><strong>${i.number}.</strong> ${i.title}</p>`).join('')}
        </div>`
      });
      return;
    }
    console.log('Generating post for option', parsed.choice);

    const [igHtml, fbHtml] = await Promise.all([
      generatePostHTML(chosen, 'instagram'),
      generatePostHTML(chosen, 'facebook')
    ]);
    const igPath = path.join(TEMP_DIR, 'ig.png');
    const fbPath = path.join(TEMP_DIR, 'fb.png');
    await takeScreenshot(igHtml, igPath);
    await takeScreenshot(fbHtml, fbPath);
    const [igUrl, fbUrl] = await Promise.all([uploadImage(igPath), uploadImage(fbPath)]);

    const caps = parseJSON(
      await claude(`Generate captions for this Accelod post:
Title: ${chosen.title}
Concept: ${chosen.concept}
Hook: ${chosen.hook}

Return ONLY JSON: { "igCaption": "...", "fbCaption": "..." }

Instagram caption: punchy, direct, max 10-12 lines, soft CTA ("Sound familiar?" / "Doing this manually?" etc), end with 20-25 hashtags (#AIAutomation #N8N #GoHighLevel #BusinessAutomation #Entrepreneur #ClaudeAI #GoogleWorkspace #WorkflowAutomation #AIAgents #Accelod etc).
Facebook caption: punchy, direct, max 10-12 lines, same soft CTA style — 3 to 5 hashtags max (most relevant only, e.g. #AIAutomation #BusinessAutomation #Entrepreneur), conversational tone, ends with a single engagement question to drive comments.`, 1024),
      'captions parse'
    );

    await sendPreviewEmail(igUrl, fbUrl, 1, null, igPath, fbPath);
    writeState({
      status: 'awaiting_approval',
      chosen_idea: chosen,
      wants_video: parsed.wantsVideo,
      ig_caption: caps.igCaption,
      fb_caption: caps.fbCaption,
      ig_url: igUrl,
      fb_url: fbUrl,
      ig_html: igHtml,
      fb_html: fbHtml,
      version: 1
    });

  } else if (state.status === 'awaiting_approval') {
    const intent = parseJSON(
      await claude(`Today is ${new Date().toISOString().split('T')[0]}. User reviewed their social post preview and replied: "${emailBody}"
Are they approving to post, requesting changes, or approving with a specific schedule or immediate publish?
- "post now" / "post immediately" / "go live now" → postNow: true
- Specific time (e.g. "schedule for Friday 6pm", "post tomorrow at 9am") → extract UTC ISO 8601 datetime into scheduledAt
- Plain approval ("post it", "looks good") → queue as normal
Return ONLY JSON: { "intent": "approve"|"amend", "amendments": "changes description or null", "scheduledAt": "ISO8601 datetime or null", "postNow": true|false }`, 512),
      'intent parse'
    );

    if (intent.intent === 'approve') {
      await callN8n(process.env.N8N_IMAGE_WEBHOOK, {
        igImageUrl: state.ig_url,
        fbImageUrl: state.fb_url,
        igCaption: state.ig_caption,
        fbCaption: state.fb_caption,
        scheduledAt: intent.scheduledAt || null,
        postNow: intent.postNow || false
      });
      writeState({ status: 'idle', chosen_idea: null, ig_url: null, fb_url: null, ig_html: null, fb_html: null, version: 0 });
      console.log('Approved — posted to Buffer via N8N.');

    } else {
      if (state.version >= 5) {
        await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
          subject: 'Re: Accelod Post – Revision limit reached',
          htmlBody: '<p>5 revisions reached on this post. Reply <strong>“post it”</strong> to publish the current version, or <strong>“start over”</strong> to reset.</p>'
        });
        return;
      }
      if (!state.ig_html || !state.fb_html) throw new Error('State is missing HTML — cannot apply amendments');
      console.log('Applying amendments:', intent.amendments);

      const [updIg, updFb] = await Promise.all([
        claude(`Update this Instagram post HTML. Changes requested: ${intent.amendments}\n\nOnly apply changes to the Instagram portrait format (1080x1350). Preserve all brand rules and layout.\n\nCurrent HTML:\n${state.ig_html}\n\nReturn ONLY the complete updated HTML.`),
        claude(`You are updating the Facebook landscape post (1200x630). Changes requested: ${intent.amendments}\n\nIMPORTANT: If the requested changes are Instagram-specific (e.g. portrait layout, IG headline size, IG-only elements), return the current HTML COMPLETELY UNCHANGED. Only apply changes that make sense for the Facebook landscape format.\n\nCurrent HTML:\n${state.fb_html}\n\nReturn ONLY the complete updated HTML.`)
      ]);

      const igPath = path.join(TEMP_DIR, 'ig.png');
      const fbPath = path.join(TEMP_DIR, 'fb.png');
      await takeScreenshot(updIg, igPath);
      await takeScreenshot(updFb, fbPath);
      const [igUrl, fbUrl] = await Promise.all([uploadImage(igPath), uploadImage(fbPath)]);

      await sendPreviewEmail(igUrl, fbUrl, state.version + 1, intent.amendments, igPath, fbPath);
      writeState({ ...state, ig_html: updIg, fb_html: updFb, ig_url: igUrl, fb_url: fbUrl, version: state.version + 1 });
    }

  } else {
    console.log('No active post session — reply ignored.');
  }
}

async function main() {
  const eventType = process.env.EVENT_TYPE;
  const rawBody = process.env.EMAIL_BODY;
  let emailBody = null;
  try {
    emailBody = rawBody && rawBody !== 'null' && rawBody !== '""' ? JSON.parse(rawBody) : null;
  } catch (e) {
    console.error('Failed to parse EMAIL_BODY:', e.message);
  }
  console.log('Event:', eventType, '| Email reply:', !!emailBody);

  if (eventType === 'repository_dispatch' && emailBody) {
    await handleEmailReply(emailBody);
  } else if (eventType === 'workflow_dispatch') {
    const state = readState();
    if (state.status === 'awaiting_approval') {
      await handleResendPreview();
    } else {
      await handleSchedule();
    }
  } else {
    await handleSchedule();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
