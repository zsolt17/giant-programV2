// Static reference content for the Recovery > Tendon Health feature.
// Phase dosing and joint/tendon/exercise definitions live here so the UI layer
// stays purely presentational. See ARCHITECTURE.md (Recovery section) for the
// feature spec, data model, and screen layout.
//
// Icons are inline SVG (64x64 viewBox, stroke-width 2.5, round caps, no fill).
// They use CSS custom properties `--text-secondary` (figure) and `--border-strong`
// (props/reference) — Recovery.tsx defines those on a wrapper from the app's theme
// tokens, so these strings stay theme-agnostic.

export type Joint = 'wrist' | 'elbow' | 'shoulder' | 'knee' | 'ankle'
export type Phase = 'acute' | 'build' | 'maintenance'

export interface TendonExercise {
  key: string
  tendonName: string
  exerciseName: string
  icon: string // inline SVG, 64x64
}

export const PHASE_DOSE: Record<Phase, string> = {
  acute: '3 sets × 30s, 2x/day',
  build: '3 sets × 30s, 3-4x/week',
  maintenance: '3 sets × 30s, 1x/week',
}

// Reference only — Recovery computes phase/day from LOCAL dates (engine/recovery.ts)
// to match the rest of the app's date discipline. Kept for parity with the spec.
export function getSuggestedPhase(startDate: Date, today: Date = new Date()): Phase {
  const days = Math.floor((today.getTime() - startDate.getTime()) / 86_400_000)
  if (days <= 20) return 'acute'
  if (days <= 56) return 'build'
  return 'maintenance'
}

const I = (body: string): string =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
const PROP = 'stroke="var(--border-strong)" stroke-width="2"' // solid prop/surface
const PROPD = 'stroke="var(--border-strong)" stroke-width="2" stroke-dasharray="3 3"' // dashed reference / band

export const RECOVERY_CONTENT: Record<Joint, TendonExercise[]> = {
  wrist: [
    {
      key: 'wrist-extensors',
      tendonName: 'Wrist extensors (ECRL/ECRB/ECU)',
      exerciseName: 'Isometric wrist extension hold',
      // forearm braced on a table, palm down, wrist held extended (hand up)
      icon: I(`<line x1="8" y1="44" x2="36" y2="44" ${PROP}/><line x1="14" y1="38" x2="40" y2="38"/><line x1="40" y1="38" x2="52" y2="24"/><line x1="52" y1="24" x2="58" y2="26"/>`),
    },
    {
      key: 'wrist-flexors',
      tendonName: 'Wrist flexors (FCR/FCU)',
      exerciseName: 'Isometric wrist flexion hold',
      // forearm braced (palm up), wrist held flexed (hand curls down toward forearm)
      icon: I(`<line x1="8" y1="28" x2="36" y2="28" ${PROP}/><line x1="14" y1="34" x2="40" y2="34"/><line x1="40" y1="34" x2="52" y2="48"/><line x1="52" y1="48" x2="58" y2="46"/>`),
    },
  ],
  elbow: [
    {
      key: 'elbow-common-extensor',
      tendonName: 'Common extensor tendon (lateral epicondyle)',
      exerciseName: 'Isometric wrist extension hold, elbow extended',
      // arm straight, wrist extended (tennis-elbow position)
      icon: I(`<circle cx="10" cy="18" r="4"/><line x1="13" y1="21" x2="44" y2="34"/><line x1="44" y1="34" x2="54" y2="22"/><line x1="54" y1="22" x2="58" y2="24"/>`),
    },
    {
      key: 'elbow-common-flexor',
      tendonName: 'Common flexor tendon (medial epicondyle)',
      exerciseName: 'Isometric wrist flexion hold, elbow extended',
      // arm straight, wrist flexed (golfer's-elbow position)
      icon: I(`<circle cx="10" cy="18" r="4"/><line x1="13" y1="21" x2="44" y2="34"/><line x1="44" y1="34" x2="52" y2="48"/><line x1="52" y1="48" x2="56" y2="46"/>`),
    },
    {
      key: 'elbow-distal-biceps',
      tendonName: 'Distal biceps',
      exerciseName: 'Isometric bicep curl hold (~90°)',
      // upper arm vertical, elbow bent ~90°, forearm horizontal holding a load
      icon: I(`<circle cx="20" cy="9" r="4"/><line x1="20" y1="13" x2="20" y2="38"/><line x1="20" y1="38" x2="42" y2="38"/><circle cx="47" cy="38" r="5" ${PROP}/>`),
    },
    {
      key: 'elbow-triceps',
      tendonName: 'Triceps tendon',
      exerciseName: 'Isometric overhead extension hold (lockout)',
      // arm straight overhead, elbow locked, holding a load at the top
      icon: I(`<line x1="24" y1="58" x2="24" y2="40"/><line x1="24" y1="40" x2="24" y2="12"/><circle cx="24" cy="8" r="4" ${PROP}/>`),
    },
  ],
  shoulder: [
    {
      key: 'shoulder-supraspinatus',
      tendonName: 'Supraspinatus',
      exerciseName: 'Isometric abduction hold (~30° from body)',
      // torso + arm raised ~30° out from the side
      icon: I(`<circle cx="22" cy="9" r="4"/><line x1="22" y1="13" x2="22" y2="52"/><line x1="22" y1="22" x2="44" y2="40"/>`),
    },
    {
      key: 'shoulder-infraspinatus',
      tendonName: 'Infraspinatus / teres minor',
      exerciseName: 'Isometric external rotation hold',
      // elbow pinned at side (90°), forearm rotated outward against a band
      icon: I(`<circle cx="18" cy="9" r="4"/><line x1="18" y1="13" x2="18" y2="34"/><line x1="18" y1="34" x2="42" y2="30"/><line x1="42" y1="30" x2="54" y2="32" ${PROPD}/>`),
    },
    {
      key: 'shoulder-subscapularis',
      tendonName: 'Subscapularis',
      exerciseName: 'Isometric internal rotation hold',
      // elbow pinned at side (90°), forearm rotated inward across the body
      icon: I(`<circle cx="40" cy="9" r="4"/><line x1="40" y1="13" x2="40" y2="34"/><line x1="40" y1="34" x2="16" y2="30"/><line x1="16" y1="30" x2="6" y2="32" ${PROPD}/>`),
    },
    {
      key: 'shoulder-biceps',
      tendonName: 'Long head of biceps',
      exerciseName: 'Isometric bicep hold, arm at side',
      // arm at side, slight bend, holding a load
      icon: I(`<circle cx="24" cy="9" r="4"/><line x1="24" y1="13" x2="25" y2="40"/><line x1="25" y1="40" x2="31" y2="52"/><circle cx="33" cy="55" r="4" ${PROP}/>`),
    },
  ],
  knee: [
    {
      key: 'knee-patellar',
      tendonName: 'Patellar tendon',
      exerciseName: 'Spanish squat hold',
      icon: `<svg viewBox="0 0 64 64" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round">
  <line x1="52" y1="6" x2="52" y2="58" stroke="var(--border-strong)" stroke-width="2" stroke-dasharray="3 3"/>
  <circle cx="24" cy="12" r="5"/>
  <line x1="24" y1="17" x2="40" y2="34"/>
  <line x1="40" y1="34" x2="22" y2="38"/>
  <line x1="22" y1="38" x2="26" y2="58"/>
  <line x1="40" y1="34" x2="44" y2="48"/>
  <line x1="44" y1="48" x2="46" y2="58"/>
  <line x1="30" y1="22" x2="20" y2="32"/>
</svg>`,
    },
    {
      key: 'knee-quad',
      tendonName: 'Quad tendon',
      exerciseName: 'Isometric leg extension hold (~60-90°)',
      icon: `<svg viewBox="0 0 64 64" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round">
  <line x1="10" y1="44" x2="40" y2="44" stroke="var(--border-strong)" stroke-width="2"/>
  <circle cx="22" cy="14" r="5"/>
  <line x1="22" y1="19" x2="22" y2="40"/>
  <line x1="22" y1="40" x2="50" y2="36"/>
  <line x1="22" y1="40" x2="18" y2="58"/>
  <line x1="22" y1="26" x2="14" y2="34"/>
</svg>`,
    },
    {
      key: 'knee-hamstring',
      tendonName: 'Hamstring (distal)',
      exerciseName: 'Isometric leg curl hold',
      icon: `<svg viewBox="0 0 64 64" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round">
  <line x1="14" y1="8" x2="14" y2="40" stroke="var(--border-strong)" stroke-width="2" stroke-dasharray="3 3"/>
  <circle cx="26" cy="12" r="5"/>
  <line x1="26" y1="17" x2="26" y2="38"/>
  <line x1="26" y1="38" x2="22" y2="58"/>
  <line x1="26" y1="38" x2="40" y2="44"/>
  <line x1="40" y1="44" x2="34" y2="30"/>
  <line x1="26" y1="24" x2="14" y2="20"/>
</svg>`,
    },
  ],
  ankle: [
    {
      key: 'ankle-achilles',
      tendonName: 'Achilles',
      exerciseName: 'Isometric calf raise hold (straight + bent knee variants)',
      // standing on the forefoot, heel raised off the ground
      icon: I(`<line x1="8" y1="56" x2="44" y2="56" ${PROP}/><line x1="26" y1="10" x2="26" y2="40"/><line x1="26" y1="40" x2="30" y2="52"/><line x1="30" y1="52" x2="40" y2="56"/>`),
    },
    {
      key: 'ankle-peroneals',
      tendonName: 'Peroneals',
      exerciseName: 'Isometric eversion hold (band resistance)',
      // seated, foot held everted (turned outward) against a band
      icon: I(`<line x1="24" y1="10" x2="24" y2="42"/><line x1="24" y1="42" x2="40" y2="46"/><line x1="40" y1="46" x2="52" y2="44" ${PROPD}/>`),
    },
    {
      key: 'ankle-tib-post-ant',
      tendonName: 'Tibialis posterior/anterior',
      exerciseName: 'Isometric inversion / dorsiflexion hold',
      // seated, foot held inverted / dorsiflexed (turned up-and-in) against a band
      icon: I(`<line x1="34" y1="10" x2="34" y2="42"/><line x1="34" y1="42" x2="18" y2="36"/><line x1="18" y1="36" x2="8" y2="38" ${PROPD}/>`),
    },
  ],
}
