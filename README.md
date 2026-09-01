# Accelod Social

Automated pipeline for Accelod's Instagram and Facebook posts. GitHub Actions (cron + email
webhook) drives `scripts/automate.js`, which generates self-contained HTML posts, screenshots
them with Puppeteer, uploads to imgbb, and emails previews via n8n. Replies to that email are
routed back through n8n to a `repository_dispatch` event, which resumes the pipeline. Approval
fires a second n8n webhook that posts to Buffer.

## Brand

`brand/ACCELOD-BRAND.md` is the single source of truth for colours, type, logos and layout rules
— both `generatePostHTML` and the amendment prompts read it directly rather than duplicating it
inline. `brand/examples/` optionally holds up to 3 past posts as few-shot references (see its
README). The `.claude/skills/accelod-post` skill lets you draft or critique a post locally in
Claude Code without going through the email loop, using the same brand file.

## State machine

All state lives in `post-state.json`. `status` drives what an incoming event does.

```
                    ┌─────────────────────────────────────────┐
                    ▼                                          │
                  idle                                         │
                    │ (schedule fires, status was idle)        │
                    ▼                                          │
            awaiting_choice ──(feedback, no number)──┐         │
                    │                                 │         │
                    │ (reply: 1 / 2 / 3)               │         │
                    │                                 │         │
                    ▼                                 │         │
           [generate + review post]                    │         │
                    │                                 │         │
                    ▼                                 │         │
           awaiting_approval ◄──(regenerate ideas)────┘         │
              │        │                                        │
   (amend) ───┘        └─── (approve, no video) ─────────────────┘
       │                          │
       │                          └─── (approve, wants video) ──┐
       ▼                                                        ▼
  [stays awaiting_approval,                          awaiting_video_prompt_approval
   version++]                                              │        │
                                                  (approve) │        │ (skip)
                                                             ▼        │
                                                     generating_video │
                                                             │        │
                                                             ▼        │
                                                   awaiting_video_approval
                                                       │           │
                                          (post video) │           │ (skip)
                                                        ▼           ▼
                                                       idle ◄───────┘
```

- **idle** — nothing in flight. The daily cron (`handleSchedule`) only generates fresh ideas when
  status is `idle`; any other status causes that run to be skipped, so a stuck non-idle state
  silently blocks new idea generation until it's resolved.
- **awaiting_choice** — 3 ideas emailed, waiting for a reply. A reply containing `1`/`2`/`3` picks
  an idea and moves to `awaiting_approval`. A reply with no number is treated as feedback and
  regenerates 3 new ideas, staying in `awaiting_choice`.
- **awaiting_approval** — post preview emailed, waiting for a reply. "Post it" (or equivalent)
  approves and fires the Buffer webhook, then goes to `idle` (or `awaiting_video_prompt_approval`
  if video was requested). Anything else is treated as an amendment — HTML is regenerated with
  brand rules re-applied, re-screenshotted, re-uploaded, and the preview is re-sent with
  `version` incremented, staying in `awaiting_approval`.
- **awaiting_video_prompt_approval** — Higgsfield motion prompt emailed for review before any
  credits are spent. Approve moves to `generating_video`; skip returns to `idle`.
- **generating_video** — transient, while polling Higgsfield. If a run crashes here, the next
  `workflow_dispatch` detects the stuck state and reverts to `awaiting_video_prompt_approval` so
  the user can retry rather than being stuck indefinitely.
- **awaiting_video_approval** — finished video emailed. "Post video" sends it to the video
  webhook and returns to `idle`; "skip video" also returns to `idle`.

## Local development

`scripts/automate.js` calls `process.exit` paths and expects `ANTHROPIC_API_KEY`,
`N8N_EMAIL_WEBHOOK`, `N8N_IMAGE_WEBHOOK`, `N8N_VIDEO_WEBHOOK`, `IMGBB_API_KEY` and `GITHUB_TOKEN`
as environment variables (these are GitHub Actions secrets in CI — see
`.github/workflows/social-posts.yml`). It also runs `main()` unconditionally on require, so it
isn't safe to `require()` from a test script — write an isolated script that duplicates the
relevant function instead, or use the `accelod-post` skill for local drafting/critique work.
