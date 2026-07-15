# Reference

Technical reference for Observer OS — routes, API endpoints, database schema, and the core formulas behind the numbers. See `README.md` for the overview and setup instructions.

## Pages

| Route | Purpose |
|---|---|
| `/` | Root redirect — sends logged-in users to `/home`, everyone else to `/auth` |
| `/auth` | Sign in / sign up |
| `/home` | Landing page — time-based greeting, ring of shortcuts (desktop) / grid (mobile), first-login onboarding banner |
| `/checkin` | Daily sleep/mood/energy/soreness/fatigue check-in, readiness score |
| `/log` | Log a run / lift / study session |
| `/dashboard` | Stats overview, weight logging, 14-day charts |
| `/nutrition` | Today's macro + water targets, AI meal logging, meal-type grouped log |
| `/nutrition/history` | Past days' nutrition, junk-day tracking, expandable daily breakdown |
| `/history` | Session history with filtering and inline edit |
| `/calendar` | Month view of check-ins and sessions |
| `/metrics` | HRV, resting HR, VO2 max, body fat tracking |
| `/records` | Auto-detected personal records |
| `/load` | Training load (ATL / CTL / TSB) |
| `/goals` | Goal setting, progress, weekly training plan |
| `/coach` | AI chat coach |
| `/profile` | Athlete profile — identity, training, nutrition goal, location |
| `/settings` | Bug/feedback reporting, About section |

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Coach chat — Groq tool-calling loop against `agent-tools.ts` |
| `/api/nudge` | POST | One-line coaching insight after a check-in or session log |
| `/api/review` | POST | 14-day weekly review (check-ins, sessions, weight, nutrition) → single AI summary |
| `/api/coach/quick-plan` | POST | Generates a training plan directly via `executeTool`, bypassing the LLM for speed/determinism |
| `/api/nutrition/parse` | POST | Parses free-text meal input into itemized macros (`foodParser.ts`) |
| `/api/nutrition/targets` | GET | Computes today's calorie/macro/water targets (`nutritionEngine.ts`) |
| `/api/feedback` | POST | Sends a bug/feedback report via Resend |
| `/api/push` | POST | Subscribe/unsubscribe a push notification endpoint |
| `/api/push/send`, `/api/push-send` | POST | Send a push notification — **note:** these are duplicate routes doing the same thing; worth consolidating into one at some point |

## Database tables

All tables except `food_cache` are RLS-scoped to `auth.uid() = user_id`.

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `name`, `age`, `sex`, `height_cm`, `split`, `weekly_goal`, `target_weight`, `nutrition_goal_type`, `latitude`/`longitude`/`city_name` | One row per user; location fields are optional, drive weather-adjusted hydration |
| `daily_logs` | `date`, `sleep_hours`, `sleep_quality`, `soreness`, `fatigue`, `mood`, `energy`, `notes` | One per user per day (unique constraint) |
| `sessions` | `date`, `type` (`run`/`lift`/`study`), `duration`, `rpe`, `notes` | Multiple per day allowed |
| `weight_logs` | `date`, `weight` | One per user per day |
| `water_logs` | `date`, `amount_ml`, `logged_at` | Multiple entries per day, summed for daily total |
| `goals` | `type`, `title`, `target_value`, `current_value`, `unit`, `deadline`, `direction`, `active` | `type` is one of `weight`/`sleep`/`sessions_per_week`/`run_distance`/`custom` |
| `training_plans` | `week_start`, `plan` (JSONB array of days), `notes` | One per user per week (unique constraint) |
| `body_metrics` | `date`, `hrv`, `resting_hr`, `vo2max`, `body_fat`, `notes` | All fields nullable, log whichever you have |
| `nutrition_logs` | `meal_group_id`, `date`, `meal_type` (`breakfast`/`lunch`/`dinner`/`snack`/`junk`), `item_name`, `portion_desc`, `source`, `confidence`, `calories`/`protein`/`carbs`/`fat`/`fiber` | One row per food item; `meal_group_id` ties items from the same logged input together |
| `food_cache` | `query_normalized`, `source`, `*_per_100g` | **Shared across all users** — no `user_id`, just a lookup cache; not personal data |
| `push_subscriptions` | `endpoint`, `p256dh`, `auth` | Web Push subscription per device |
| `personal_records` | `type`, `metric`, `value`, `date` | Auto-upserted by `prDetection.ts` after each session log |

## Core formulas (`src/lib/nutritionEngine.ts`)

- **BMR** (Mifflin-St Jeor): `10×weight(kg) + 6.25×height(cm) − 5×age`, `+5` for male / `−161` for female
- **TDEE**: `BMR × 1.2` (sedentary baseline) + today's session calorie add-on (MET-based for runs, flat-rate for lifts)
- **Calorie target**: TDEE + goal adjustment (bulk +350, cut −400, recomp 0, endurance +100, or a deadline-based rate capped at ±500/day), floored at `1.1 × BMR`
- **Protein**: 1.3–2.2 g/kg depending on today's training (higher for lift+run days), +0.2 g/kg on a cut
- **Carbs**: 2.5–7 g/kg depending on training, +18g if readiness score < 5
- **Water**: `weight×35ml + sessions×300ml`, +750ml if creatine logged that day, +250 to +750ml tiered by local temperature (25°C+/30°C+/35°C+)
- **Readiness score**: `sleep_quality×0.3 + mood×0.2 + energy×0.2 + (10−soreness)×0.15 + (10−fatigue)×0.15`, scored ≥8 high / ≥5 moderate / below low
- **BMI**: standard `weight(kg) / height(m)²`, WHO category bands

## Nutrition parsing pipeline (`src/lib/foodParser.ts`)

Per food item, in order:
1. **Supplements table** — exact macros for creatine, BCAA, EAA, electrolytes, multivitamin, fish oil, glutamine, pre-workout, whey (bypasses AI entirely to avoid hallucination)
2. **Generic foods table** — hardcoded values for plain vegetables/greens and plain salad, since AI estimates for these are inconsistent; skipped if the text implies oil/dressing/added protein
3. **Cache → Open Food Facts → AI estimation**, in that order, for everything else

Portion-size handling: explicit grams > countable units (eggs, rotis, slices) > a leading number qualifying a container ("1 small bowl of X") > diminutive phrases ("a little bit of", with or without a leading "a") > size words with optional half/quarter fraction modifiers > generic 100g assumption as a last resort. Confidence is downgraded to medium whenever the portion was inferred rather than explicitly stated.

## External services

| Service | Used for | API key required |
|---|---|---|
| Supabase | Auth, Postgres, RLS | Yes |
| Groq (Llama 3.3 70B) | Coach chat, nutrition AI estimation, weekly review | Yes |
| Open-Meteo | Current temperature for water target, city geocoding | No |
| Open Food Facts | Branded food nutrition lookup | No |
| Resend | Bug/feedback report emails | Yes |
| web-push (VAPID) | Push notifications | Self-generated keys |

## Known limitations

- Nutrition AI estimation is inherently inconsistent for vague food descriptions — the supplements and generic-foods tables cover the most common cases, but new phrasings will keep surfacing edge cases.
- `food_cache` entries from before a parsing fix don't get retroactively corrected; clear specific entries (`delete from food_cache where query_normalized = '...'`) if a stale bad estimate keeps reappearing.
- Duplicate push-send routes (see API table above) — functional, just redundant.
