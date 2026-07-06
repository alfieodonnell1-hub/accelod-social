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

function stripHtml(text) {
  // Claude sometimes wraps HTML in markdown fences despite being told not to
  return text.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function getUKTzInfo() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' }).formatToParts(new Date());
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
  const offsetHours = tzName === 'BST' ? 1 : 0;
  return { tzName, offsetHours, label: `${tzName} (UTC+${offsetHours})` };
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

async function generateIdeas(feedback = null, avoidTitles = []) {
  const avoidClause = avoidTitles.length
    ? `\nDO NOT repeat or closely resemble any of these previously suggested topics: ${avoidTitles.slice(-12).join(' | ')}`
    : '';
  const feedbackClause = feedback
    ? `\nThe user gave this feedback on the previous ideas: "${feedback}". Use it to guide a different direction.`
    : '';
  const varietyInstruction = `
Each idea must be a clearly DIFFERENT post format and topic — one could be a stat/data post, one a before/after, one a case study or story, one a myth-bust, one a tool breakdown, etc. Rotate formats so they never all look the same.`;

  const raw = await claude(`Generate 3 social media post ideas for Accelod, an AI automation consultancy run by Alfie O'Donnell.
Target audience: business owners and entrepreneurs who want to automate.
Brand voice: confident, direct, no fluff, slightly edgy.
Tools featured: Claude AI, N8N, GoHighLevel, Google Workspace.
${varietyInstruction}${avoidClause}${feedbackClause}

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
  ? `Instagram vertical (1080×1350). Think mobile-first — someone scrolling on a phone should read the key value in under 2 seconds.
     Structure: badge → BIG bold headline → short punchy subtitle → content panel → CTA pill + logo.
     The content panel must use VARIED visual elements — not just bullet points. Use a mix of: large stat callouts (e.g. "27 → 4" in huge type), icon rows (use emoji or simple inline SVG shapes as icons), before/after comparisons, numbered steps with accent colours, bold contrast highlights. Make it feel designed, not generated.`
  : `Facebook landscape (1200×630). Left column (360px): badge + headline + subtitle + CTA + logo. Right panel (flex:1): dark content panel (#06101A) — MUST be visually rich with 3-5 items using icons, stats, or comparison rows. Never just plain text. Panel must NEVER be empty.`}

TOOL LOGOS — whenever these tools appear in the post content, use an <img> tag with these exact URLs (32–40px square, object-fit:contain):
- Claude AI / Anthropic: https://cdn.simpleicons.org/anthropic/00D4FF
- N8N: https://cdn.simpleicons.org/n8n/EA4B71
- Google Workspace / Google: https://cdn.simpleicons.org/google
- GoHighLevel: use this inline SVG directly (copy verbatim into the HTML, use wherever GHL appears):
  <svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#112240"/><path d="M20,72 L20,52 L14,52 L26,28 L38,52 L32,52 L32,72 Z" fill="#F59E0B"/><path d="M50,76 L50,50 L43,50 L55,22 L67,50 L60,50 L60,76 Z" fill="#3B82F6"/><path d="M72,72 L72,52 L66,52 L78,28 L90,52 L84,52 L84,72 Z" fill="#22C55E"/></svg>
- If any other named tool appears, check cdn.simpleicons.org/{toolname} and use it
Place logos inline next to tool names in rows/lists. Never use emoji as a logo substitute when a real logo URL is available.

BRAND RULES (non-negotiable):
- Background: #0B1929. Accents: #00D4FF and #33E1FF
- Google Fonts CDN: Outfit 900/700/400, DM Sans 500/400, JetBrains Mono 500/400
- Claude 12-spoke asterisk SVG <symbol id="claude-star"> — bg watermark top-right (opacity 0.05, rotate 12deg) AND badge icon
- Badge: inline-flex cyan border pill, "AI Automation" label + asterisk icon
- Headline: Outfit 900, white, one key word wrapped in <em> with cyan gradient (-webkit-background-clip:text)
- CTA pill: conversational engagement hook e.g. "Sound familiar?" "Doing this manually?" — NEVER a sales line
- Accelod logo: bottom right, gradient #00D4FF→#33E1FF, clearly visible
- Content panel: bg #06101A, border 1px solid rgba(0,212,255,0.2), border-radius 16px
- Dot-grid radial texture + top-left radial glow

TYPOGRAPHY — MOBILE FIRST (critical):
- Headline: ${isIg ? 'min 96px' : 'min 62px'}, Outfit 900, tight letter-spacing (-0.03em)
- Body / panel text: min 22px — nothing smaller, ever
- Key stats / callout numbers: min 48px bold, cyan gradient
- Labels / mono tags: min 18px JetBrains Mono

VISUAL CREATIVITY (required):
- Use large accent numbers, percentage callouts, or stat blocks as visual anchors
- Use emoji OR simple inline SVG icons (circles, arrows, checkmarks built from SVG paths) as row icons — not just text
- Vary the rhythm: mix full-width stat rows with smaller label rows, use colour fills on alternate rows
- At least one element should be a large typographic number or bold stat that is instantly readable at thumbnail size
- No wall-of-text content panels — every item needs a visual accent (icon, number, colour stripe, or highlight box)

Include export PNG button + dom-to-image-more@3.3.0 CDN script.
Return ONLY the complete HTML file — no markdown, no code fences, no explanation.`, 16384);
  return stripHtml(raw);
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

async function handleRepost() {
  const state = readState();
  if (!state.repost_scheduled_at) { console.log('No repost pending.'); return; }
  if (!state.ig_caption || !state.fb_caption) throw new Error('No captions in state for repost');

  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  const igPath = path.join(TEMP_DIR, 'ig.png');
  const fbPath = path.join(TEMP_DIR, 'fb.png');

  async function downloadAsset(assetPath, dest) {
    const apiUrl = `https://api.github.com/repos/alfieodonnell1-hub/accelod-social/contents/${assetPath}`;
    const r = await fetch(apiUrl, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
    if (!r.ok) throw new Error(`GitHub asset download failed: ${r.status}`);
    const json = await r.json();
    fs.writeFileSync(dest, Buffer.from(json.content, 'base64'));
  }

  console.log('Downloading images from GitHub assets...');
  await Promise.all([
    downloadAsset('assets/ig-latest.png', igPath),
    downloadAsset('assets/fb-latest.png', fbPath)
  ]);

  console.log('Uploading to imgbb...');
  const [igUrl, fbUrl] = await Promise.all([uploadImage(igPath), uploadImage(fbPath)]);

  console.log('Scheduling post for', state.repost_scheduled_at);
  await callN8n(process.env.N8N_IMAGE_WEBHOOK, {
    igImageUrl: igUrl,
    fbImageUrl: fbUrl,
    igCaption: state.ig_caption,
    fbCaption: state.fb_caption,
    scheduledAt: state.repost_scheduled_at,
    postNow: false
  });

  writeState({ repost_scheduled_at: null });
  console.log('Repost scheduled successfully.');
}

async function generateVideoPrompt(concept) {
  return (await claude(`Write a Higgsfield image-to-video motion prompt for this social media post graphic.
The graphic is a static dark-background business post that should be brought to life with subtle, premium motion.
Post concept: ${concept.title} — ${concept.concept}

Rules: subtle is better than dramatic. Think slow particle drift, gentle cyan glow pulses on accent elements,
slight camera zoom or parallax on the background texture, text elements with a soft shimmer.
Keep it cinematic and professional — this is a B2B brand, not a consumer app.
Under 60 words. Return ONLY the motion prompt.`, 200)).trim();
}

async function generateVideo(imageUrl, motionPrompt) {
  const [keyId, keySecret] = (process.env.HIGGSFIELD_API_KEY || '').split(':');
  if (!keyId || !keySecret) throw new Error('HIGGSFIELD_API_KEY must be in KEY_ID:KEY_SECRET format');

  const authHeader = `${keyId}:${keySecret}`;
  const BASE = 'https://platform.higgsfield.ai';

  console.log('Submitting video to Higgsfield:', motionPrompt.slice(0, 60));
  const submitRes = await fetch(`${BASE}/v1/image2video/dop`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authHeader}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'dop-turbo',
      prompt: motionPrompt,
      input_images: [{ type: 'image_url', image_url: imageUrl }]
    })
  });
  const job = await submitRes.json();
  console.log('Higgsfield submit response:', JSON.stringify(job).slice(0, 200));
  if (!job.request_id && !job.id) throw new Error('Higgsfield submit failed: ' + JSON.stringify(job));

  const requestId = job.request_id || job.id;
  const statusUrl = job.status_url || `${BASE}/requests/${requestId}/status`;

  // Poll every 30s for up to 15 minutes
  for (let i = 1; i <= 30; i++) {
    await new Promise(r => setTimeout(r, 30000));
    const statusRes = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${authHeader}` } });
    const status = await statusRes.json();
    console.log(`Video status [${i}/30]: ${status.status}`);
    if (status.status === 'completed') {
      const url = status.video?.url || status.jobs?.[0]?.results?.raw?.url;
      if (!url) throw new Error('Completed but no video URL in response: ' + JSON.stringify(status));
      return url;
    }
    if (status.status === 'failed') throw new Error('Higgsfield generation failed');
    if (status.status === 'nsfw') throw new Error('Higgsfield rejected content as NSFW');
  }
  throw new Error('Video generation timed out after 15 minutes');
}

async function handleVideoPrepare() {
  // Step 1: Generate prompt and send for review BEFORE spending Higgsfield credits
  const state = readState();
  if (!state.wants_video || !state.ig_url || !state.chosen_idea) {
    console.log('No video requested or missing state — skipping.');
    return;
  }
  console.log('Generating motion prompt for review...');
  const motionPrompt = await generateVideoPrompt(state.chosen_idea);
  console.log('Motion prompt:', motionPrompt);

  writeState({ status: 'awaiting_video_prompt_approval', motion_prompt: motionPrompt, ig_html: null, fb_html: null });

  await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
    subject: `Re: Accelod Post – Review your video prompt before we generate`,
    htmlBody: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px">
      <h2 style="color:#0B1929">Review before we spend credits</h2>
      <p style="color:#444">Here's the motion prompt I'll send to Higgsfield for <strong>${state.chosen_idea.title}</strong>:</p>
      <div style="background:#f4f4f4;border-left:4px solid #00D4FF;padding:16px 20px;margin:20px 0;border-radius:4px;font-style:italic;color:#222">
        ${motionPrompt}
      </div>
      <p style="color:#444">Reply <strong>"submit"</strong> to generate the video with this prompt.</p>
      <p style="color:#444">Or paste your own version and I'll use that instead.</p>
      <p style="color:#444">Reply <strong>"skip video"</strong> to cancel.</p>
    </div>`
  });
  console.log('Prompt review email sent.');
}

async function handleVideoSubmit(motionPrompt) {
  // Step 2: Actually call Higgsfield — only runs after prompt is approved
  const state = readState();
  console.log('Submitting to Higgsfield with prompt:', motionPrompt.slice(0, 80));
  writeState({ status: 'generating_video', motion_prompt: motionPrompt });

  const videoUrl = await generateVideo(state.ig_url, motionPrompt);
  console.log('Video ready:', videoUrl);

  writeState({ status: 'awaiting_video_approval', video_url: videoUrl, motion_prompt: null });

  await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
    subject: `Re: Accelod Post – Your video is ready`,
    htmlBody: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px">
      <h2 style="color:#0B1929">Your video is ready</h2>
      <p><strong>${state.chosen_idea?.title || ''}</strong></p>
      <p style="margin:16px 0">
        <a href="${videoUrl}" style="display:inline-block;padding:14px 28px;background:#0B1929;color:#00D4FF;border:2px solid #00D4FF;border-radius:8px;text-decoration:none;font-weight:700">▶ Watch Video</a>
      </p>
      <p style="color:#444">Reply <strong>"post video"</strong> to publish to Instagram and Facebook.</p>
      <p style="color:#444">Reply <strong>"skip video"</strong> to leave it for now.</p>
    </div>`
  });
  console.log('Video approval email sent.');
}

async function handleResendPreview() {
  const state = readState();
  if (state.status !== 'awaiting_approval') { console.log('No preview to resend — state is', state.status); return; }
  if (!state.ig_html || !state.fb_html) throw new Error('State is missing HTML — cannot resend preview');
  const igPath = path.join(TEMP_DIR, 'ig.png');
  const fbPath = path.join(TEMP_DIR, 'fb.png');
  console.log('Re-rendering stored HTML for resend...');
  await takeScreenshot(state.ig_html, igPath);
  await takeScreenshot(state.fb_html, fbPath);
  await sendPreviewEmail(state.ig_url, state.fb_url, state.version, null, igPath, fbPath);
  console.log('Preview email resent for v' + state.version);
}

async function handleResendIdeas() {
  const state = readState();
  if (state.status !== 'awaiting_choice' || !Array.isArray(state.ideas)) {
    console.log('No pending ideas to resend.');
    return;
  }
  console.log('Resending ideas email...');
  await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
    subject: `Accelod Post Options – ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} (resent)`,
    htmlBody: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#0B1929">Your Accelod post ideas (resent):</h2>
      ${state.ideas.map(i => `
        <div style="margin-bottom:20px;padding:20px;border:2px solid #00D4FF;border-radius:12px;background:#f8f9fa">
          <h3 style="margin:0 0 8px;color:#0B1929">${i.number}. ${i.title}</h3>
          <p style="margin:0 0 8px;color:#444">${i.concept}</p>
          <p style="margin:0;font-style:italic;color:#0088C8"><strong>Hook:</strong> "${i.hook}"</p>
        </div>`).join('')}
      <p style="margin-top:24px">Reply with <strong>1</strong>, <strong>2</strong>, or <strong>3</strong> — or give feedback for a fresh set.</p>
    </div>`
  });
  console.log('Ideas email resent.');
}

async function handleSchedule() {
  const state = readState();
  if (state.status !== 'idle') {
    console.log('Post already in progress (' + state.status + ') — skipping scheduled run.');
    return;
  }
  console.log('Generating ideas...');
  const { ideas } = await generateIdeas(null, state.past_idea_titles || []);

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

  const pastTitles = [...(state.past_idea_titles || []), ...ideas.map(i => i.title)];
  writeState({ status: 'awaiting_choice', ideas, version: 0, past_idea_titles: pastTitles });
  console.log('Ideas emailed successfully.');
}

async function handleEmailReply(emailBody) {
  const state = readState();
  console.log('State:', state.status, '| Reply preview:', emailBody.slice(0, 80));

  if (state.status === 'awaiting_choice') {
    if (!Array.isArray(state.ideas)) throw new Error('State is missing ideas array');
    const choiceMatch = emailBody.match(/\b([123])\b/);
    const wantsVideo = /\bvideo\b/i.test(emailBody);

    if (!choiceMatch) {
      // No number picked — treat reply as feedback, regenerate ideas
      console.log('No choice number — regenerating ideas with feedback:', emailBody.slice(0, 80));
      const allPastTitles = [...(state.past_idea_titles || []), ...state.ideas.map(i => i.title)];
      const { ideas: newIdeas } = await generateIdeas(emailBody, allPastTitles);
      const newPastTitles = [...allPastTitles, ...newIdeas.map(i => i.title)];

      await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
        subject: `Re: Accelod Post Options – 3 fresh ideas`,
        htmlBody: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#0B1929">Here are 3 new ideas:</h2>
          <p style="color:#666;margin-bottom:20px"><em>Refreshed based on your feedback.</em></p>
          ${newIdeas.map(i => `
            <div style="margin-bottom:20px;padding:20px;border:2px solid #00D4FF;border-radius:12px;background:#f8f9fa">
              <h3 style="margin:0 0 8px;color:#0B1929">${i.number}. ${i.title}</h3>
              <p style="margin:0 0 8px;color:#444">${i.concept}</p>
              <p style="margin:0;font-style:italic;color:#0088C8"><strong>Hook:</strong> "${i.hook}"</p>
            </div>`).join('')}
          <p style="margin-top:24px">Reply with <strong>1</strong>, <strong>2</strong>, or <strong>3</strong> — or give more feedback for another round.</p>
        </div>`
      });

      writeState({ ...state, ideas: newIdeas, past_idea_titles: newPastTitles });
      console.log('Fresh ideas emailed.');
      return;
    }

    const parsed = { choice: parseInt(choiceMatch[1]), wantsVideo };
    const chosen = state.ideas.find(i => i.number === parsed.choice);
    if (!chosen) {
      await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
        subject: 'Re: Accelod Post Options – Which one?',
        htmlBody: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <p>Couldn't match that to an idea. Reply with <strong>1</strong>, <strong>2</strong>, or <strong>3</strong>.</p>
          ${state.ideas.map(i => `<p><strong>${i.number}.</strong> ${i.title}</p>`).join('')}
        </div>`
      });
      return;
    }
    console.log('Generating post for option', parsed.choice);
    const [igHtml, fbHtml] = await Promise.all([generatePostHTML(chosen, 'instagram'), generatePostHTML(chosen, 'facebook')]);
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
    writeState({ status: 'awaiting_approval', chosen_idea: chosen, wants_video: parsed.wantsVideo, ig_caption: caps.igCaption, fb_caption: caps.fbCaption, ig_url: igUrl, fb_url: fbUrl, ig_html: igHtml, fb_html: fbHtml, version: 1 });

  } else if (state.status === 'awaiting_approval') {
    const lower = emailBody.toLowerCase().trim();
    const quickApprove = /^(post(\s+it)?|go(\s+(ahead|live))?|approve[d]?|looks?\s+good|yes|yep|yeah|send(\s+it)?)[\s!.]*$/.test(lower);
    const quickPostNow = /\b(post\s+now|go\s+live\s+now|immediately|right\s+now)\b/.test(lower);
    let intent;
    if (quickApprove || quickPostNow) {
      console.log('Quick approval detected — skipping Claude intent parse');
      intent = { intent: 'approve', amendments: null, scheduledAt: null, postNow: quickPostNow };
    } else {
      const { label: ukTzLabel } = getUKTzInfo();
      intent = parseJSON(
        await claude(`Today is ${new Date().toISOString().split('T')[0]}. Current UTC time: ${new Date().toISOString()}.
The user is in the UK, currently on ${ukTzLabel}. All times they mention are UK local time — convert to UTC when outputting scheduledAt.
User reviewed their social post preview and replied: "${emailBody}"
Are they approving to post, requesting changes, or approving with a specific schedule or immediate publish?
- "post now" / "post immediately" / "go live now" → postNow: true
- Specific time (e.g. "schedule for Friday 6pm", "post tomorrow at 1pm") → convert from UK local to UTC ISO 8601 and put in scheduledAt
- Plain approval ("post it", "looks good") → queue as normal
Return ONLY JSON: { "intent": "approve"|"amend", "amendments": "changes description or null", "scheduledAt": "ISO8601 datetime or null", "postNow": true|false }`, 512),
        'intent parse'
      );
    }
    if (intent.intent === 'approve') {
      await callN8n(process.env.N8N_IMAGE_WEBHOOK, { igImageUrl: state.ig_url, fbImageUrl: state.fb_url, igCaption: state.ig_caption, fbCaption: state.fb_caption, scheduledAt: intent.scheduledAt || null, postNow: intent.postNow || false });
      console.log('Image approved — posted to Buffer via N8N.');
      if (state.wants_video) {
        await handleVideoPrepare();
      } else {
        writeState({ status: 'idle', chosen_idea: null, ig_url: null, fb_url: null, ig_html: null, fb_html: null, version: 0 });
      }
    } else {
      if (!state.ig_html || !state.fb_html) throw new Error('State is missing HTML — cannot apply amendments');
      console.log('Applying amendments:', intent.amendments);
      const [updIgRaw, updFbRaw] = await Promise.all([
        claude(`Update this Instagram post HTML. Changes requested: ${intent.amendments}\n\nOnly apply changes to the Instagram portrait format (1080x1350). Preserve all brand rules and layout.\n\nCurrent HTML:\n${state.ig_html}\n\nReturn ONLY the complete updated HTML file — no markdown, no code fences.`, 16384),
        claude(`You are updating the Facebook landscape post (1200x630). Changes requested: ${intent.amendments}\n\nIMPORTANT: If the requested changes are Instagram-specific (e.g. portrait layout, IG headline size, IG-only elements), return the current HTML COMPLETELY UNCHANGED. Only apply changes that make sense for the Facebook landscape format.\n\nCurrent HTML:\n${state.fb_html}\n\nReturn ONLY the complete updated HTML file — no markdown, no code fences.`, 16384)
      ]);
      const updIg = stripHtml(updIgRaw);
      const updFb = stripHtml(updFbRaw);
      const igPath = path.join(TEMP_DIR, 'ig.png');
      const fbPath = path.join(TEMP_DIR, 'fb.png');
      await takeScreenshot(updIg, igPath);
      await takeScreenshot(updFb, fbPath);
      const [igUrl, fbUrl] = await Promise.all([uploadImage(igPath), uploadImage(fbPath)]);
      await sendPreviewEmail(igUrl, fbUrl, state.version + 1, intent.amendments, igPath, fbPath);
      writeState({ ...state, ig_html: updIg, fb_html: updFb, ig_url: igUrl, fb_url: fbUrl, version: state.version + 1 });
    }
  } else if (state.status === 'awaiting_video_prompt_approval') {
    const lower = emailBody.toLowerCase().trim();
    if (/\bskip\b/.test(lower)) {
      writeState({ status: 'idle', wants_video: false, motion_prompt: null });
      console.log('Video skipped at prompt stage.');
    } else {
      const isApproval = /^(submit|looks?\s+good|use\s+it|approve[d]?|yes|go(\s+ahead)?|send\s+it|ok(ay)?)[\s!.]*$/.test(lower);
      const motionPrompt = isApproval ? state.motion_prompt : emailBody.trim();
      console.log(isApproval ? 'Prompt approved — submitting to Higgsfield' : 'Using custom prompt:', motionPrompt?.slice(0, 80));
      await handleVideoSubmit(motionPrompt);
    }

  } else if (state.status === 'awaiting_video_approval') {
    const lower = emailBody.toLowerCase();
    const skipVideo = /\bskip\b/.test(lower);
    const postVideo = /\bpost\s+video\b|\bpost\s+it\b|\byes\b|\bgo\b|\bsend\s+it\b/.test(lower);

    if (skipVideo) {
      writeState({ status: 'idle', wants_video: false, video_url: null });
      console.log('Video skipped — state reset to idle.');
    } else if (postVideo) {
      await callN8n(process.env.N8N_VIDEO_WEBHOOK, {
        videoUrl: state.video_url,
        igCaption: state.ig_caption,
        fbCaption: state.fb_caption
      });
      writeState({ status: 'idle', wants_video: false, video_url: null });
      console.log('Video approved — sent to N8N video webhook.');
    } else {
      await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
        subject: `Re: Accelod Post – Post your video?`,
        htmlBody: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <p>Reply <strong>"post video"</strong> to publish, or <strong>"skip video"</strong> to leave it.</p>
          <p><a href="${state.video_url}">Watch video again</a></p>
        </div>`
      });
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
    if (state.repost_scheduled_at) {
      await handleRepost();
    } else if (state.status === 'awaiting_approval') {
      await handleResendPreview();
    } else if (state.status === 'awaiting_choice') {
      await handleResendIdeas();
    } else if (state.status === 'generating_video') {
      // Previous job crashed mid-poll — revert to prompt approval so user can retry
      console.log('Stuck generating_video state detected — reverting to prompt review step');
      writeState({ status: 'awaiting_video_prompt_approval' });
      await callN8n(process.env.N8N_EMAIL_WEBHOOK, {
        subject: `Re: Accelod Post – Video generation failed, retry?`,
        htmlBody: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px">
          <p>The video generation timed out or failed. Your motion prompt was:</p>
          <div style="background:#f4f4f4;border-left:4px solid #00D4FF;padding:16px 20px;margin:16px 0;border-radius:4px;font-style:italic">${state.motion_prompt || '(not saved)'}</div>
          <p>Reply <strong>"submit"</strong> to retry, paste a new prompt, or <strong>"skip video"</strong> to cancel.</p>
        </div>`
      });
    } else {
      await handleSchedule();
    }
  } else {
    await handleSchedule();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
