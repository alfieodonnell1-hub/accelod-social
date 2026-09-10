# Accelod Brand Specification

## TOOL LOGOS
Never use a remote <img src="https://..."> for these four tools — CDN logo images (e.g. simpleicons.org) have been observed rendering as broken placeholders inside the CI screenshot pipeline, silently wrecking the post. Always use the inline SVG given below instead (copy verbatim into the HTML, sized 28–40px square via width/height attributes):

- Claude AI / Anthropic — reuse the brand's own 12-spoke asterisk symbol, tinted cyan:
  <svg width="32" height="32" viewBox="0 0 100 100" style="color:#00D4FF"><use href="#claude-star"/></svg>
  (requires the page to already define <symbol id="claude-star"> once, as all posts do for the watermark/badge)

- N8N — stylized connected-nodes mark in n8n's brand pink:
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EA4B71" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6M9 18h6M6 9v6M18 9v6"/></svg>

- Google Workspace / Google — four-colour "G" mark:
  <svg width="32" height="32" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>

- GoHighLevel — three-bar mark:
  <svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#112240"/><path d="M20,72 L20,52 L14,52 L26,28 L38,52 L32,52 L32,72 Z" fill="#F59E0B"/><path d="M50,76 L50,50 L43,50 L55,22 L67,50 L60,50 L60,76 Z" fill="#3B82F6"/><path d="M72,72 L72,52 L66,52 L78,28 L90,52 L84,52 L84,72 Z" fill="#22C55E"/></svg>

- Any other named tool: build a simple inline SVG (letter mark, geometric icon) in a distinct colour — never a remote image, and never an emoji as a logo substitute.

Place logos inline next to tool names in rows/lists.

## BRAND RULES (non-negotiable)
- Background: #0B1929. Accents: #00D4FF and #33E1FF
- Google Fonts CDN: Outfit 900/700/400, DM Sans 500/400, JetBrains Mono 500/400
- Claude 12-spoke asterisk SVG <symbol id="claude-star"> — bg watermark top-right (opacity 0.05, rotate 12deg) AND badge icon
- Badge: inline-flex cyan border pill, "AI Automation" label + asterisk icon
- Headline: Outfit 900, white, one key word wrapped in <em> with cyan gradient (-webkit-background-clip:text)
- CTA pill: conversational engagement hook e.g. "Sound familiar?" "Doing this manually?" — NEVER a sales line
- Accelod logo: bottom right, gradient #00D4FF→#33E1FF, clearly visible
- Content panel: bg #06101A, border 1px solid rgba(0,212,255,0.2), border-radius 16px
- Dot-grid radial texture + top-left radial glow

## TYPOGRAPHY — MOBILE FIRST (critical)
- Headline: Instagram min 96px / Facebook min 62px, Outfit 900, tight letter-spacing (-0.03em)
- Body / panel text: min 22px — nothing smaller, ever
- Key stats / callout numbers: min 48px bold, cyan gradient
- Labels / mono tags: min 18px JetBrains Mono

## VISUAL CREATIVITY (required)
- Use large accent numbers, percentage callouts, or stat blocks as visual anchors
- Use emoji OR simple inline SVG icons (circles, arrows, checkmarks built from SVG paths) as row icons — not just text
- Vary the rhythm: mix full-width stat rows with smaller label rows, use colour fills on alternate rows
- At least one element should be a large typographic number or bold stat that is instantly readable at thumbnail size
- No wall-of-text content panels — every item needs a visual accent (icon, number, colour stripe, or highlight box)
