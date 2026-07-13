// Config for the /songs/bpm-for/<activity> landing pages. A fixed, hardcoded
// list (not derived from the catalog) — these are curated search-intent
// pages ("running songs bpm", "study music bpm"), not a hub per distinct
// value in the data. BPM windows are honest, practical ranges, not marketing
// copy: running cadence, gym tempo, resting-heart-rate music, etc.
export type Activity = {
  slug: string;
  label: string;
  min: number;
  max: number;
  /** One or two sentences explaining, honestly, why this tempo range suits
   *  the activity. No claims TuneBad can't back up (cadence science, common
   *  DJ/genre conventions), no "scientifically proven" language. */
  blurb: string;
};

export const ACTIVITIES: Activity[] = [
  {
    slug: "running",
    label: "Running",
    min: 160,
    max: 180,
    blurb:
      "Many runners settle near a 170-180 steps-per-minute cadence, and matching a track's BPM to your stride keeps pace steady without a metronome. If 160-180 feels too fast to start, running to the half-time equivalent — around 80-90 BPM, one stride every other beat — works just as well for warmups and easier runs.",
  },
  {
    slug: "workout",
    label: "Workout",
    min: 120,
    max: 140,
    blurb:
      "Most gym and HIIT playlists sit in the 120-140 BPM range: fast enough to keep intensity up through a set, not so fast it feels frantic between exercises.",
  },
  {
    slug: "walking",
    label: "Walking",
    min: 100,
    max: 120,
    blurb:
      "A brisk walk lands close to 100-120 steps per minute for most people, so tracks in this range naturally match a walking pace without you having to think about it.",
  },
  {
    slug: "study-focus",
    label: "Study & Focus",
    min: 60,
    max: 90,
    blurb:
      "Slower tempos around 60-90 BPM sit close to a resting heart rate and stay in the background rather than pulling attention away from the task — a common choice for study and focus playlists, especially instrumental tracks in this range.",
  },
  {
    slug: "sleep",
    label: "Sleep",
    min: 50,
    max: 70,
    blurb:
      "Tempos at 50-70 BPM sit at or below a typical resting heart rate, slower and steadier than most pop and dance music — a common range for wind-down and sleep playlists.",
  },
  {
    slug: "yoga",
    label: "Yoga",
    min: 60,
    max: 90,
    blurb:
      "Yoga and stretching sessions typically favor slower, steadier tracks around 60-90 BPM to match controlled breathing and movement rather than a driving beat.",
  },
  {
    slug: "party-dance",
    label: "Party & Dance",
    min: 120,
    max: 130,
    blurb:
      "Most commercial dance and pop hits cluster around 120-130 BPM — the tempo range clubs and DJs default to because it's fast enough to dance to for hours without exhausting a room.",
  },
  {
    slug: "driving",
    label: "Driving",
    min: 100,
    max: 120,
    blurb:
      "100-120 BPM is a common comfortable range for driving music: upbeat enough to keep you alert on a long stretch, not so fast it encourages speeding.",
  },
];

export function findActivity(slug: string): Activity | null {
  return ACTIVITIES.find((a) => a.slug === slug) ?? null;
}
