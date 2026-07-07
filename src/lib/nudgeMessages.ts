// src/lib/nudgeMessages.ts
//
// Message bank for the contextual nudge cron (src/app/api/cron/nudge/).
// One entry per time slot, each with a few variants so it doesn't repeat
// the exact same line every day. Tone: playful/cheeky, Zomato/Swiggy
// style — pokes fun, never mean.

export type NudgeCategory =
  | "checkin"
  | "water_1"
  | "nutrition_lunch"
  | "water_2"
  | "nutrition_dinner"
  | "session";

export const NUDGE_MESSAGES: Record<NudgeCategory, { title: string; body: string }[]> = {
  checkin: [
    {
      title: "😤 Still no check-in",
      body: "Morning check-in's been waiting since 8am. It's not going anywhere, but neither should your streak.",
    },
    {
      title: "📋 Unread: your sleep data",
      body: "It's just sitting there, unread. Log it before it starts taking things personally.",
    },
    {
      title: "Bold strategy",
      body: "It's 9am and you still haven't checked in. Let's see how this plays out.",
    },
    {
      title: "☀ Check-in o'clock",
      body: "Your mood, energy, and sleep aren't going to log themselves.",
    },
  ],
  water_1: [
    {
      title: "💧 Hydration check",
      body: "Water or just vibes today?",
    },
    {
      title: "Your water log said 'ha, no'",
      body: "This morning, specifically. Let's fix that.",
    },
    {
      title: "Plot twist",
      body: "You're not tired, you're just dehydrated. Log some water.",
    },
  ],
  nutrition_lunch: [
    {
      title: "👀 1:30pm and counting",
      body: "Your nutrition log is emptier than your fridge. Log something.",
    },
    {
      title: "Intermittent fasting?",
      body: "Bro really said that at 1:30pm on a random Tuesday. Log your food.",
    },
    {
      title: "Today's macros so far",
      body: "Nothing, nothing, and nothing. Let's fix that.",
    },
    {
      title: "Lunch happened. Probably.",
      body: "Your log disagrees. Update it?",
    },
  ],
  water_2: [
    {
      title: "Afternoon slump incoming",
      body: "Hits different when you're dehydrated. Log some water.",
    },
    {
      title: "Still on 0 water?",
      body: "Bold move for a hybrid athlete.",
    },
    {
      title: "3pm brain fog",
      body: "Is just unlogged water in disguise 💧",
    },
  ],
  nutrition_dinner: [
    {
      title: "😟 We're a little concerned",
      body: "It's almost dinner and you haven't logged a single meal today.",
    },
    {
      title: "Zero meals logged today",
      body: "Either you're a camel or you forgot. Log something.",
    },
    {
      title: "Formal complaint filed",
      body: "By your stomach. Log today's food.",
    },
  ],
  session: [
    {
      title: "💪 Trained today or nah?",
      body: "Either way, log it.",
    },
    {
      title: "Suspiciously quiet tonight",
      body: "Your session log has nothing to say. Give it something.",
    },
    {
      title: "Rest day or lazy day?",
      body: "Only your log knows. Fill it in.",
    },
  ],
};

export function pickNudgeMessage(category: NudgeCategory): { title: string; body: string } {
  const options = NUDGE_MESSAGES[category];
  return options[Math.floor(Math.random() * options.length)];
}
