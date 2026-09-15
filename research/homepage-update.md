# Homepage design update

## Design sources

- Canva: https://www.canva.com/design/DAHU5aTzqWY/Z0cdgIfbNGIS7hIlOroxPw/edit
- Supplied `Yakka Website WiP.pdf`, page 1 (homepage) and pages 2–3 (hero variants).
- Canva comments: hover/focus carousel arrows, collapsible floating app badge, audience switches, expandable solution descriptions, sticky phone and selectable journey steps, feature rail, benefits switches, curved section transitions.
- Claude interaction reference: https://claude.ai/artifact/574cetcbNXihbzSyqLnU1n

## Implementation

The root entry point still redirects to `final/index.html`. The new homepage uses `homepage.css`, `homepage.js`, and local files under `assets/`. The existing privacy page and its shared legacy stylesheet are preserved.

Colours are taken from the supplied design: heading burgundy #581a1f, deeper burgundy #441317, orange #fe4d00, peach #ffb086, cream #f2f1e9. The dark gradient runs from #581a1f to approximately #6a2a2e, sampled from the exported Canva gradient artwork. Light panels use #f5f5ec to white.

The logos, phone-in-hand photo, safe illustration and embedded font subsets were extracted from the supplied PDF. Font faces are scoped to their existing Unicode coverage and have system fallbacks. Headings use the supplied Vocal Heavy Alt subset; body copy uses Satoshi. The PDF identifies Vocal as a FONTSPRING DEMO font; obtain the production webfont/licence from the designer before public release. The embedded subsets support the design copy, not arbitrary future text.

The walkthrough is an HTML/CSS illustrative app preview with six selectable states; it is not a recording of a live app. Desktop scrolling updates the sticky phone. Smaller screens stack the phone above the steps. Reduced-motion preferences disable automatic slide rotation and animated transitions.

## Pending supplied content

- Set real destinations in `YAKKA_LINKS` at the start of `final/homepage.js`: download, login and contact. Contact can be a mailto URL. Until configured, the buttons open honest availability messages; no data is submitted.
- The supplied QR code was not reused because its destination was not confirmed. The floating app badge uses the brand shield and the same configurable download action.
- Replace the clearly labelled illustrative testimonial with an approved real customer quote.
- Statistics and product/payment claims are transcribed from the supplied design and its comments; their publication evidence and operational accuracy have not been independently verified.
- Replace illustrative phone screens with approved production screenshots/video when supplied.
- The pre-existing privacy policy still contains company/contact placeholders. It was not rewritten as part of this homepage task.

## Validation

- JavaScript syntax check passed with Node.
- Checked desktop and mobile layouts, including 320px and 390px viewports, without horizontal page overflow.
- Verified all six phone states, both audience controls, solution disclosure, feature scrolling, feature dialog and Escape dismissal, mobile menu open/navigation/close, and FAQ expansion.
- Verified local assets and same-page link targets. Existing privacy-policy navigation remains available.
- No browser console errors in tested flows.

Run locally with Python: `python -m http.server 4173 --bind 127.0.0.1`, then open http://127.0.0.1:4173/ . No build step is required.
