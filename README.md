# Observer OS

Personal AI performance coach for training, recovery, and nutrition — built for a hybrid athlete (running + lifting) who also studies. One place to log everything instead of juggling five different apps that don't talk to each other.

## What it does

**Training & Recovery**
- Daily check-ins (sleep, mood, energy, soreness, fatigue) feeding a computed readiness score
- Session logging (run / lift / study) with automatic personal-record detection
- Training load tracking (ATL / CTL / TSB) with a current-form indicator
- Calendar view of check-ins and sessions by day
- Body metrics tracking (HRV, resting HR, VO2 max, body fat)

**Nutrition**
- Natural-language meal logging — type what you ate, resolved via personal food memory → a shared admin-curated food database → an AI pipeline (cache → Open Food Facts → AI estimation) for anything not already known
- Handles fractions ("half a plate"), diminutive phrases ("a little bit of"), explicit grams, countable units, and container sizes ("a small bowl of")
- Daily macro and water targets computed from BMR/TDEE (Mifflin-St Jeor), goal type, today's training load, creatine intake, and local weather (hotter days raise the water target automatically)
- Meal-type tagging (breakfast / lunch / dinner / snack / junk) with a dedicated history view tracking junk-food frequency and daily averages
- Water intake quick-logging with a live progress ring

**AI Coach**
- Chat interface backed by Groq (Llama 3.3 70B) with tool-calling into your real data — check-ins, sessions, nutrition, goals
- Desktop: persistent sidebar with weekly stats and one-tap actions (weekly review, generate plan, set a goal) that call dedicated endpoints directly rather than going through the LLM
- Mobile: same actions tucked into a bottom sheet
- Weekly review pulls 14 days of check-ins, sessions, weight, and nutrition into a single AI-generated summary

**Goals & Records**
- Goal setting with progress tracking and auto-generated weekly training plans
- Personal records page, auto-detected from logged sessions

**Personalization**
- Home screen with a time-based greeting and a ring of shortcuts on desktop (grid on mobile), with a first-login banner nudging incomplete profiles toward setup
- Push notifications for daily check-in/session reminders
- Settings page for bug/feedback reporting (emailed directly via Resend) and an About section

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Database / Auth:** Supabase (Postgres + Row Level Security, scoped per user)
- **AI:** Groq (Llama 3.3 70B) for the coach and nutrition parsing
- **Weather:** Open-Meteo (free, keyless)
- **Email:** Resend (bug/feedback reports)
- **Push notifications:** web-push (VAPID)
- **Styling:** Tailwind CSS v4 + custom CSS variables (dark theme, neon accent)
- **Icons:** lucide-react

## Getting started

### Prerequisites
- Node.js, npm
- A Supabase project
- A Groq API key
- A Resend account (only needed for the Settings bug-report feature)

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
VAPID_EMAIL=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
RESEND_API_KEY=
BUG_REPORT_TO_EMAIL=
```

### Database setup

Run these in the Supabase SQL Editor, in order:
1. `supabase/schema.sql` — core tables (daily logs, sessions, weight, goals, training plans)
2. `supabase/nutrition_schema.sql` — nutrition logging, food cache, and profile nutrition fields
3. Water tracking table (`water_logs`, with RLS policies)
4. Profile location fields (`latitude`, `longitude`, `city_name`) for weather-adjusted hydration
5. Extend the `nutrition_logs.meal_type` check constraint to include `'junk'`
6. `supabase/user_foods_schema.sql` then `supabase/user_foods_v2.sql` — per-user personal food memory
7. `supabase/global_foods_schema.sql` — shared admin-curated food database; edit the seed email in that file to grant yourself admin

### Install & run

```bash
npm install
npm run dev
```

## Notes

- Every personal-data table is scoped with RLS to `auth.uid() = user_id` — this app supports multiple accounts cleanly, with no data crossover between users. `global_foods` is the one deliberate exception: readable by every account, writable only by admins (`app_admins`).
- Nutrition parsing is AI-assisted and improves iteratively as edge cases get found in real use — it's a "good enough for daily logging" tool, not a lab-grade measurement.
- Built by Rajdeep Dey, a BTech AI & Data Science student and hybrid athlete from Assam, India.