/**
 * Placeholder copy, written once (T-30.9).
 *
 * Every "Coming soon" surface reads from here so the build speaks with one
 * voice: present tense for what the surface IS, plain statements about what
 * the real product does, no apologies and no marketing. The same reasoning as
 * `lib/toast/messages.ts` — wording is a design decision, so it lives with
 * the other ones instead of being improvised per page.
 */

export const COMING_SOON_COPY = {
  apps: {
    title: 'AI Apps',
    description: 'Reusable AI skills that run across your meetings.',
    detail:
      'You pick from skills like Sales Call Analysis or Interview Scorecard, or write ' +
      'your own prompt, and it runs automatically on every matching meeting.',
  },
  integrations: {
    title: 'Integrations',
    description: 'Connect the tools where your meetings already live.',
    detail:
      'Fireflies joins calls from your calendar, pushes notes to your CRM and docs, ' +
      'and posts recaps to your team chat. This build scopes to imported transcripts.',
  },
  team: {
    title: 'Team',
    description: 'Everyone in your workspace, and what they can see.',
    detail:
      'Admins invite teammates, assign roles and set sharing rules — who can view, ' +
      'comment on or share each meeting. This build has a single seeded workspace.',
  },
  analytics: {
    title: 'Analytics',
    description: 'How your team spends its meeting time.',
    detail:
      'Talk-to-listen ratios, sentiment trends and topic tracking across every ' +
      'conversation. The charts below mix real seeded aggregates with labelled sample data.',
  },
  liveBot: {
    title: 'Capture live meeting',
    description: 'Send the Fireflies notetaker to a call in progress.',
    detail:
      'The real-time bot joins Zoom, Meet or Teams from a meeting link and transcribes ' +
      'as people speak. Out of scope for this build — import a transcript instead.',
  },
} as const

/** The six disabled skill cards on `/apps` (T-30.2). */
export const APP_SKILLS = [
  {
    id: 'sales-call-analysis',
    name: 'Sales Call Analysis',
    description: 'Scores discovery calls on talk ratio, objections raised and next steps.',
  },
  {
    id: 'interview-scorecard',
    name: 'Interview Scorecard',
    description: 'Grades candidate interviews against your rubric, question by question.',
  },
  {
    id: 'meeting-prep-brief',
    name: 'Meeting Prep Brief',
    description: 'Summarises every prior conversation with an attendee before you join.',
  },
  {
    id: 'topic-tracker',
    name: 'Topic Tracker',
    description: 'Follows a phrase — a competitor, a feature — across all meetings.',
  },
  {
    id: 'daily-digest',
    name: 'Daily Digest',
    description: 'One morning email with yesterday’s decisions and open action items.',
  },
  {
    id: 'custom-skill',
    name: 'Custom Skill',
    description: 'Write your own prompt and run it on every matching meeting.',
  },
] as const

/** Lettermarks only — shipping real third-party logo files is a licensing bug. */
export const INTEGRATIONS = [
  { id: 'zoom', name: 'Zoom', mark: 'Zm', blurb: 'Auto-join and record scheduled calls' },
  { id: 'google-meet', name: 'Google Meet', mark: 'GM', blurb: 'Capture Meet calls from Calendar' },
  { id: 'teams', name: 'Microsoft Teams', mark: 'Tm', blurb: 'Record and transcribe Teams calls' },
  { id: 'slack', name: 'Slack', mark: 'Sl', blurb: 'Post recaps to a channel after each call' },
  { id: 'notion', name: 'Notion', mark: 'No', blurb: 'Sync meeting notes into your pages' },
  { id: 'hubspot', name: 'HubSpot', mark: 'Hs', blurb: 'Log calls against contacts and deals' },
  { id: 'salesforce', name: 'Salesforce', mark: 'Sf', blurb: 'Attach transcripts to opportunities' },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    mark: 'GC',
    blurb: 'Know which meetings to join next',
  },
] as const
