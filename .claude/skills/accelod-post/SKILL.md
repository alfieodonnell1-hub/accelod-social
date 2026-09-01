---
name: accelod-post
description: Generate, critique and amend Accelod social media posts as self-contained HTML for Instagram (1080x1350) and Facebook (1200x630). Use this skill whenever the user mentions an Accelod post, a social post, a carousel, an IG or Facebook graphic, post ideas, captions, or wants to review or fix an existing rendered post — even if they do not name the skill or the repo. Also use it when critiquing a screenshot of a post for brand or readability problems.
---

# Accelod Post

Produces on-brand social graphics for Accelod, an AI automation consultancy selling to UK SMBs
in recruitment, accountancy, legal/conveyancing and the trades.

## Before you write anything

Read `brand/ACCELOD-BRAND.md`. It is the single source of truth for colour, type, logo and
layout. Never restate its values from memory and never soften them — they are constraints, not
suggestions. If a request conflicts with the brand file, say so rather than quietly deviating.

Read up to three files from `brand/examples/` if present. Match their visual density and rhythm.
Do not reuse their copy.

## Voice

Confident, direct, no fluff, slightly edgy. Write like a person who has actually done the work,
not a marketer describing it. One idea per line. Concrete numbers over adjectives — "cut quoting
from 2 days to 12 seconds", not "dramatically faster".

Never use a sales line as the CTA. The CTA pill is a conversational hook: "Sound familiar?",
"Doing this manually?", "Still on spreadsheets?"

## The bar for a post

A post passes when all of these hold:

1. **Thumbnail test.** The core claim is readable at 200px wide. If the headline needs zooming,
   it fails.
2. **One visual anchor.** A large stat, a before/after, or a bold typographic number that carries
   the post on its own.
3. **No wall of text.** Every panel item needs an icon, number, colour stripe or highlight box.
   A panel of plain bullets is a failure.
4. **Varied rhythm.** Mix full-width stat rows with smaller label rows. Alternate fills.
5. **Real logos.** Use the CDN URLs and inline SVG from the brand file. Never substitute an emoji
   for a tool that has a real logo.
6. **Format variety across posts.** Rotate between stat post, before/after, case study, myth-bust
   and tool breakdown. Check `post-state.json` past_idea_titles and avoid repeating a theme, not
   just a title.

## Claims and accuracy

Any statistic, percentage or client result must be one the user has supplied or confirmed. Do not
invent plausible-sounding numbers. If a concept needs a figure the user has not given, mark it
`[NEEDS SOURCE]` in the draft and flag it — an unverifiable stat aimed at accountants and
conveyancers is a credibility problem, not a creative flourish.

## Reviewing a rendered post

When given a PNG, evaluate against the brand file and the six criteria above. Return specific,
actionable violations with the exact fix — "panel body is 18px, brand minimum is 22px", not
"text feels small". Check in this order: headline legibility, body sizes, contrast on gradient
text, empty or text-only panels, logo visibility, overflow and cropping.

Prioritise by reach: the headline and the top third of the canvas matter most, because that is
what survives the feed.

## Amending

When amending, always re-read the brand file alongside the existing HTML. Apply only the
requested change. If a change is Instagram-specific, leave the Facebook file untouched, and
vice versa. Return the complete HTML file — no markdown fences, no explanation.
