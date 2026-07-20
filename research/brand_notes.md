# Yakka Brand & Design Notes

## Brand Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| Primary Orange | #fd6a20 | Primary brand color, CTAs, key UI elements |
| Bright Orange | #ff5700 | Accent/highlight, active states |
| Light Orange/Peach | #ffb086 | Secondary accent, hover states, soft highlights |
| Dark Maroon | #441217 | Deep accent, text on light backgrounds |
| Dark Red-Brown | #581a1f | Secondary dark accent |
| Warm Gray | #7e756a | Body text, secondary text |
| Light Beige/Tan | #c7beb4 | Borders, dividers, subtle backgrounds |
| Off-White/Cream | #f1f1e8 | Page backgrounds, card backgrounds |
| Off-White (alt) | #f1f0e7 | Alternative background shade |
| Near Black | #1c1c1b | Primary text, headings |
| Black | #000000 | Text, icons |
| White | #ffffff | Backgrounds, text on dark surfaces |

### Color Palette Summary
- **Primary**: Orange tones (#fd6a20, #ff5700) — energetic, trustworthy, action-oriented
- **Dark tones**: Maroon/dark red-brown (#441217, #581a1f) — premium, serious, trust
- **Neutrals**: Warm grays and beiges (#7e756a, #c7beb4, #f1f1e8) — clean, professional, approachable
- **Text**: Near-black (#1c1c1b) for readability

## Typography

| Font | Weights | Usage |
|------|---------|-------|
| Satoshi | Regular, Medium, Bold, Black, Italic, BoldItalic | Primary brand font — headings, body text, UI elements |
| Mazurquica-Media | Regular | Decorative/display — likely logo or special headings |
| CanvaSans | Regular, Bold, Italic, BoldItalic, RegularItalic | Design document annotations (may not be in final app) |
| GlacialIndifference | Bold | Possible secondary display font |

### Typography Notes
- **Satoshi** is the primary typeface used throughout the app UI in multiple weights (Regular for body, Bold/Black for headings)
- **Mazurquica-Media** appears to be used for the logo or decorative brand elements
- Clean, modern sans-serif approach aligns with fintech/app design trends

## Key Messaging & Taglines

### Primary Taglines
- **"Pay securely — released only when the job is done right."** (Customer-facing)
- **"Get paid on time (everytime) — without chasing customers."** (Tradie-facing)
- **"Secure upfront payments — released only when the job is done"**

### Supporting Messages
- "Your payment has been securely held with YAKKA."
- "YAKKA protects your payment and ensures fair confirmation for both sides."
- "Funds are securely held by YAKKA, you're safe to start work."
- "Payment is held until I confirm the job is complete"
- "If anything isn't completed as agreed, you can raise a concern and YAKKA will return the relevant amount to you."
- "The clearer your breakdown, the stronger your protection if there's ever a dispute."
- "YAKKA keeps this information as your proof of agreement — your best protection if anything goes wrong."

### Core Value Proposition
YAKKA is a secure payment platform that sits between tradies (tradespeople) and their customers, holding payment in escrow until work is confirmed complete — protecting both parties.

## App Features

### Core Features
1. **Secure Escrow Payments** — Customer pays upfront, funds held by YAKKA until job confirmed complete
2. **Job Breakdown System** — Detailed task-by-task pricing (like a digital quote)
3. **Job Sharing via Link/Code** — Either party can initiate; share via WhatsApp, email, messages, or copy link
4. **Dispute Resolution** — Structured process with evidence upload, reviewed by YAKKA within 5 days
5. **Partial Payments** — Available for jobs 4+ weeks or upfront material costs (capped at 50%)
6. **In-App Messaging** — Timeline of job events, image uploads, communication between parties
7. **Photo Evidence System** — Before/after photos for dispute protection
8. **Review & Rating System** — Star ratings + optional text (like Uber), both parties rate each other
9. **Job Status Tracking** — Real-time status cards with clear explanations
10. **Team Management** — Account owners can invite team members with restricted access
11. **Identity Verification** — Stripe Identity for ID + facial verification; company house checks
12. **Invoice Downloads** — Past job records with downloadable invoices
13. **Referral Program** — "Refer friend & No YAKKA fees on your next 3 completed jobs"

### Payment Features
- Bank transfer (free, no additional fees)
- Credit/debit card (card provider fee applies, passed to customer)
- Apple Pay / Google Pay (via Stripe)
- Payment Protection Fee: 2% charged to customer
- YAKKA Commission: 5% charged to tradie
- Encrypted payment processing

## App Flow

### Customer Flow
1. **Sign Up** — Choose account type (Customer or Tradie), enter name, email, mobile, password
2. **Create Job** — Enter job title, location (postcode), proposed start date, general notes
3. **Share Job** — Send job link to tradie via WhatsApp/email/messages/copy link (or enter a Job Code if tradie initiated)
4. **Await Breakdown** — Tradie adds detailed task breakdown with pricing
5. **Review Breakdown** — Customer reviews each task, description, and price
6. **Pay Securely** — Customer pays total (job price + 2% protection fee) into YAKKA's secure account
7. **Job In Progress** — Monitor status, upload photos, message tradie
8. **Mark Complete** — Once satisfied, confirm job complete to release payment
9. **Or Raise Dispute** — If issues, raise dispute with evidence (photos + description)
10. **Leave Review** — Rate tradie with stars + optional comment

### Tradie Flow
1. **Sign Up** — Choose "Tradie", then "I work on my own" or "I have a team"
2. **Complete Profile** — Business details, bank details, ID verification (Stripe), select trades, location, upload profile picture, accreditations
3. **Receive/Create Job** — Either receive customer's job link or create job and send link to customer
4. **Add Job Breakdown** — Detailed task-by-task breakdown with titles, descriptions, prices, notes (min £100 per line item)
5. **Generate & Share Link** — Send payment link to customer
6. **Await Payment** — Customer reviews and pays
7. **Start Work** — Once payment confirmed, safe to begin
8. **Upload Photos** — Before and after images for protection
9. **Mark Complete** — Notify customer job is done
10. **Receive Payment** — Released once customer confirms (or automatically after 7 days if no response)

### Dispute Flow
1. Customer taps "Raise a Dispute" (encouraged to message tradie first)
2. Select disputed line items from job breakdown
3. Describe issue + upload photo evidence (required)
4. YAKKA reviews (non-disputed amounts released immediately)
5. Tradie notified, can submit counter-evidence
6. YAKKA decides within 5 working days
7. Outcome: Release / Refund / Partial refund per line item
8. Messaging between parties disabled during dispute

## Design Style

### Visual Direction
- **Modern, clean mobile-first UI** — Card-based layout, clear hierarchy
- **Warm and professional** — Orange primary with warm neutrals (not cold/corporate)
- **Trust-focused** — Shield imagery, secure language, clear status indicators
- **Approachable fintech** — Simple flows, plain language, tip boxes
- **Status-driven UX** — Color-coded status indicators for job progress

### UI Patterns
- Card-based job listings with status badges
- Bottom navigation bar (Home, Live Jobs, Past Jobs, Messages, Profile)
- Pop-up modals for confirmations and important info
- Scrollable task breakdowns
- Step-by-step onboarding (Step 1/4 progress indicators)
- Info icons (ℹ️) with expandable explanations
- Tip boxes with helpful guidance
- "Don't show this again" option for recurring info popups
- Share integration (WhatsApp, email, messages, copy link)

### Design Elements
- Shield icon (security/trust symbol — "TICK TURNS INTO THE YAKKA Y")
- Orange border accents
- Color-coded status circles reflecting job status
- Clean white cards on off-white/cream backgrounds
- Bold headings with regular weight body text

## Benefits for Tradies

1. **Guaranteed Payment** — "Get paid on time (everytime) — without chasing customers"
2. **Payment Security** — Funds held securely by YAKKA before work begins; safe to start knowing payment is guaranteed
3. **No Payment Chasing** — Eliminates awkward follow-ups; payment released automatically after 7 days if customer doesn't respond
4. **Dispute Protection** — Detailed job breakdowns + photo evidence protect against unfair disputes
5. **Professional Quoting** — Digital job breakdown serves as proof of agreement
6. **Partial Payments** — Can request up to 50% for long jobs (4+ weeks) or upfront materials
7. **Team Management** — Add team members who can update jobs, upload photos, mark complete
8. **Simple Onboarding** — Quick profile setup with Stripe verification
9. **Referral Rewards** — No YAKKA fees on next 3 completed jobs when referring a friend
10. **Fair Commission** — 5% commission only on completed jobs
11. **Invoice Management** — Download invoices, view past job records
12. **Review System** — Build reputation through customer ratings

## Benefits for Clients

1. **Payment Protection** — "Pay securely — released only when the job is done right"
2. **Escrow Security** — Money held by YAKKA, only released when customer confirms satisfaction
3. **Clear Pricing** — Detailed task-by-task breakdown before paying (no surprises)
4. **Dispute Resolution** — If work isn't as agreed, raise a concern and get relevant amount refunded
5. **Transparency** — Real-time job status tracking with clear explanations at each stage
6. **Photo Evidence** — Before/after photos stored for reference
7. **No Risk** — Payment only released when job confirmed complete
8. **Communication** — In-app messaging with tradie, full job history in one place
9. **Fair Process** — YAKKA reviews disputes impartially based on evidence from both sides
10. **Low Cost** — 2% payment protection fee covers secure handling and dispute protection
11. **Flexibility** — Can review breakdown before committing; can message tradie with questions
12. **Automatic Protection** — If dispute raised, payment paused automatically

## Trust & Security

### Security Features
- **Escrow Payment System** — Funds held by YAKKA (not sent directly to tradie)
- **Stripe Integration** — Secure, encrypted payment processing
- **Identity Verification** — Stripe Identity for ID + facial verification of tradies
- **Company House Checks** — Background verification for registered businesses
- **Credit Checks** — Run in background during tradie onboarding
- **Bank-Level Security** — Face ID / phone password for app access (like banking apps)

### Trust Indicators
- **Payment Protection Fee (2%)** — Explicitly covers "secure payment handling and protection if there's a dispute"
- **7-Day Auto-Release** — If customer doesn't respond within 7 days, payment released automatically (protects tradies)
- **Structured Dispute Process** — 5-day resolution timeline, evidence-based decisions
- **Photo Evidence System** — Both parties encouraged to document work
- **Detailed Job Breakdowns** — Serve as proof of agreement for both sides
- **Review System** — Ratings build accountability and trust
- **Terms & Conditions Agreement** — Required before payment
- **Clear Status Communication** — Both parties always know where they stand

### Trust Messaging
- "YAKKA uses secure, encrypted payment processing"
- "YAKKA protects your payment and ensures fair confirmation for both sides"
- "Your money will be securely held with YAKKA until the job is complete"
- "YAKKA will compare both sides against the agreed job breakdown"
- "We will review the case and issue a decision within 5 days"
