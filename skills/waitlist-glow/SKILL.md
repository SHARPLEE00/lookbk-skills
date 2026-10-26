---
name: waitlist-glow
description: Make a one-screen waitlist or coming-soon page - a slowly breathing gradient glow, a serif headline, one email field that really signs people up (Formspree, Netlify Forms, Buttondown, Mailchimp or your own endpoint), an optional live countdown to launch - as a single HTML file, and test the sign-up end to end before it goes live. Use when someone wants a waitlist, coming-soon, pre-launch or early-access page.
---

# Waitlist Glow

A calm, one-screen page for collecting emails before launch: a soft three-colour glow that breathes behind a large serif headline, one email field with a button, a line of proof, a privacy line, and an optional countdown to the launch date. It's a single HTML file with no build step to deploy.

The form is real. It posts to the service you choose, works without JavaScript, and with JavaScript shows the result in place: a thank-you line on success, an error message that keeps the form when the service fails. It has a hidden spam trap and a proper label, and a script tries the whole sign-up in Chrome against a stand-in service before you put it live.

## What you need

- Node.js 18 or newer. Nothing to install.
- Chrome, Chromium or Edge for the checks (the scripts find it; set `CHROME_PATH` if they don't).
- An account with one of the services below, or your own endpoint.
- Internet access when the page is opened, for its Google Fonts (Fraunces, Manrope and JetBrains Mono by default). Without it the page uses system fonts.

This skill's folder is `<skill>` below: the folder this SKILL.md is in.

## Steps

### 1. Decide where sign-ups go

Ask the person which service they use, or recommend one:

| `provider`   | Set up                                                                                                                                         | What to put in `form`                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `formspree`  | Create a form at formspree.io; its URL ends in the form's ID. Simplest choice for any host.                                                    | `"id": "xayzbqwe"`                                                                                              |
| `netlify`    | Only when the page is deployed on Netlify. Netlify finds the form in the HTML at deploy time; sign-ups appear under the site's Forms tab.      | `"name": "waitlist"` (the name shown in Netlify)                                                                |
| `buttondown` | A Buttondown newsletter. People get Buttondown's confirmation page and email.                                                                  | `"username": "yourname"`                                                                                        |
| `endpoint`   | Anything else that accepts a form post: your own API, or a mailing-list form URL (Mailchimp's embedded form `action`, Kit, Loops and similar). | `"url": "https://…"`, `"field"` if it isn't `email` (Mailchimp's is `EMAIL`), `"ajax": false` for list services |

With `ajax` (the default for `formspree`, `netlify` and `endpoint`), the page sends the form with JavaScript and shows `success` or `error` in place. With `"ajax": false` it's a classic form post and the service's own page takes over. An endpoint used with `ajax` must answer with a 2xx status, and if it's on another domain, allow the page's origin (CORS). It receives `application/x-www-form-urlencoded` with the email field and a `website` field that people never see: drop any sign-up where `website` is filled in.

### 2. Write `waitlist.json`

```json
{
  "brand": { "name": "soon", "note": "Launching winter 2026" },
  "eyebrow": "Private beta",
  "title": "Something *calm*\nis coming.",
  "text": "A notes app that breathes with you. Fewer buttons, softer edges.",
  "form": {
    "provider": "formspree",
    "id": "xayzbqwe",
    "button": "Join the waitlist",
    "success": "You're on the list. We'll send one email when your invite is ready."
  },
  "proof": "Early invites roll out weekly",
  "fine": "One email when your invite is ready. No newsletter, no sharing.",
  "launch": "2026-12-01T17:00:00Z",
  "links": [{ "label": "Privacy", "href": "/privacy" }],
  "theme": {
    "bg": "#0b0b10",
    "fg": "#f4f5f8",
    "glow": ["#ffb37a", "#ff7ab6", "#7a9bff"]
  },
  "meta": {
    "title": "soon: something calm is coming",
    "description": "A notes app that breathes with you. Join the waitlist for an early invite.",
    "url": "https://soon.example/"
  }
}
```

| Field                                    | What it is                                                                                                                                                                                                                                       | Limit  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `brand.name`, `brand.note`, `brand.href` | Name top left; the note top right (a launch season, a city)                                                                                                                                                                                      | 24, 36 |
| `eyebrow`                                | Small capitals above the headline: "Private beta", "Coming 2027"                                                                                                                                                                                 | 28     |
| `title`                                  | The headline. `*word*` sets it in italic in the accent colour, `\n` breaks the line (up to 3 lines)                                                                                                                                              | 60     |
| `text`                                   | What it is and why to sign up, one or two sentences                                                                                                                                                                                              | 180    |
| `form`                                   | `provider` and its settings (step 1); `placeholder` (32), `button` (24), `success` and `error` messages (120)                                                                                                                                    | –      |
| `proof`                                  | One line beside a row of coloured dots: something true that makes signing up feel worth it                                                                                                                                                       | 48     |
| `fine`                                   | What you'll send and how often. Keep it honest; it's the line people read before typing their address                                                                                                                                            | 90     |
| `launch`                                 | Launch time with its zone, e.g. `"2026-12-01T17:00:00Z"`: shows a live countdown, which hides itself once the time has passed                                                                                                                    | –      |
| `links[]`                                | Small links at the bottom: privacy policy, contact, social. `{ "label", "href" }`                                                                                                                                                                | 20     |
| `theme`                                  | `bg`, `fg`, `glow` (three hex colours), optional `accent` (italic word and dot; default the second glow colour), `opacity` (glow strength), `serif`, `sans`, `mono` (Google Fonts families), `fonts` (`""` for none, or your own stylesheet URL) | –      |
| `meta`                                   | `title` (70) and `description` (170) for search and link previews; `url`, `image` (an https link-preview picture), `icon`, `lang`                                                                                                                | –      |

Copy rules: the headline names the feeling or the outcome, not the product category. `proof` and any numbers must be true: if there's no real list size or customer yet, use a fact about the launch ("Invites go out weekly", "Founder's price for the first 500"). Link a privacy policy when you collect emails; ask the person for its URL.

The glow can sit behind any text, so the build works out the brightest the glow gets and derives every text colour from `fg` and `bg` to read on it. If the glow is too strong for `fg`, it's dimmed automatically and the build says so.

### 3. Build

```bash
node <skill>/scripts/build.mjs waitlist.json out
```

It lists every problem in `waitlist.json` at once, then writes `out/index.html` and says where the form posts. Read that line: it should be the person's service, not an example's.

### 4. Check it

```bash
node <skill>/scripts/check.mjs out/index.html
node <skill>/scripts/try-form.mjs out/index.html
node <skill>/scripts/screenshot.mjs out/index.html
```

- `check.mjs` loads the page at 390, 768, 1024 and 1440 px and must say `ok` at each: nothing cut off or wider than the screen, readable contrast, a labelled field, one h1.
- `try-form.mjs` fills in `test@example.com` and submits in headless Chrome, against a stand-in for the service on this machine (nothing reaches the real one). It shows exactly what was sent, what the visitor sees after, and, for in-place forms, what they see when the service fails. It must end with `The form works.`
- `screenshot.mjs` saves `out/screens/desktop.png` and `mobile.png`; look at them.

### 5. Put it live

Upload `out/index.html` as the site's home page (or any path): Netlify, Vercel, Cloudflare Pages, GitHub Pages, any static host. On Netlify with `"provider": "netlify"`, form detection must be on for the site (Forms in the site settings).

Then sign up once on the live page with the person's own address and confirm it reaches the service's dashboard or inbox. Some services send the form owner a confirmation the first time a form is used.

## Troubleshooting

- **`build: fix waitlist.json first`**: each line names the field and what to change.
- **try-form says nothing was sent**: the email field must stay `required` and the button `type="submit"`; rebuild instead of editing the HTML.
- **The live form fails but try-form passes**: the service rejected it. For `endpoint` with `ajax`, check the endpoint's CORS settings and that it returns 2xx; for Formspree, the form's ID and that the form isn't disabled; for Netlify, that the site was deployed after the form was added.
- **The page is in system fonts**: Google Fonts couldn't be reached. Install the families and set `"fonts": ""`.

## Files

- `scripts/build.mjs`: checks `waitlist.json` and writes the page, with its CSS and a small script for the form and countdown inlined.
- `scripts/try-form.mjs`: the end-to-end sign-up test against a local stand-in.
- `scripts/check.mjs`, `scripts/screenshot.mjs`, `scripts/chrome.mjs`: Chrome checks and screenshots.
- `scripts/color.mjs`, `scripts/markup.mjs`: colour maths and the HTML writer.
- `examples/soon/` (dark, Formspree) and `examples/loam/` (light, Netlify): complete `waitlist.json` files. The products, IDs and addresses in them are made up. The previews on Lookbk are built from these.
- `NOTICE.md`: the fonts and software this skill uses.
