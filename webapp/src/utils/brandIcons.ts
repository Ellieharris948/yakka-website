/** Original 24-unit Yakka icons. The logo's rounded, square-tipped dot is
 * used as a meaningful part of each symbol, rather than a notification badge. */
export const YAKKA_DOT_PATH = 'M 1 6 C 1 2.5 3.5 1 7 1 H 9 V 5 C 9 8 7.5 9 5 9 C 2.5 9 1 8 1 6 Z';

type IconDrawing = { paths: string[]; dot?: [number, number, number] };
export const BRAND_ICONS = {
  settings: { paths: ['M10 2h4l.6 3 2 1.2 2.9-.9 2 3.4-2.3 2v2.6l2.3 2-2 3.4-2.9-.9-2 1.2-.6 3h-4l-.6-3-2-1.2-2.9.9-2-3.4 2.3-2v-2.6l-2.3-2 2-3.4 2.9.9 2-1.2Z'], dot: [9, 9, .6] },
  home: { paths: ['M3 10.5 12 3l9 7.5M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9'], dot: [8.5, 11, .7] },
  message: { paths: ['M20.5 14.5a4 4 0 0 1-4 4H9L3.5 22V7.5a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z', 'M7.5 8.5h8'], dot: [6.7, 11, .5] },
  account: { paths: ['M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2'], dot: [6.5, 1, 1.1] },
  bell: { paths: ['M5 10a7 7 0 0 1 14 0v4l2 3H3l2-3Z'], dot: [9.5, 18.5, .5] },
  jobs: { paths: ['M9 6V3h6v3', 'M4 6h16a1 1 0 0 1 1 1v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1Z', 'M3 10l6 3m6 0 6-3'], dot: [9.5, 10.5, .5] },
  bank: { paths: ['M3 8l9-5 9 5M3 21h18M5 11v6m14-6v6'], dot: [9, 10, .6] },
  history: { paths: ['M4 8a9 9 0 1 1-1 8M3 3v6h6M12 7v5l4 2'], dot: [1, 11, .5] },
  team: { paths: ['M2 21v-2a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v2M16 14a5 5 0 0 1 6 5v2M17 4a4 4 0 0 1 0 8'], dot: [3.5, 2, 1] },
  lock: { paths: ['M7 10V7a5 5 0 0 1 10 0v3M5 10h14v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z'], dot: [9.5, 13, .5] },
  support: { paths: ['M3 13v-2a9 9 0 0 1 18 0v7a3 3 0 0 1-3 3h-3M3 11h3v7H3Zm15 0h3v7h-3Z'], dot: [9.5, 18.5, .5] },
  bug: { paths: ['M8 5l-2-2m10 2 2-2M8 9V7a4 4 0 0 1 8 0v2M6 9h12v7a6 6 0 0 1-12 0ZM2 11h4m12 0h4M2 16h4m12 0h4M4 22l3-3m10 0 3 3'], dot: [9.5, 12, .5] },
  star: { paths: ['M12 2.5l3 6 6.5 1-4.8 4.7 1.1 6.6L12 17.7l-5.8 3.1 1.1-6.6-4.8-4.7 6.5-1Z'], dot: [10, 9, .4] },
  document: { paths: ['M14 3H5v18h14V8Zm0 0v5h5M8 12h7M8 16h3'], dot: [13, 14.5, .4] },
  shield: { paths: ['M12 2.5 21 6v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z'], dot: [8, 7, .8] },
  cookie: { paths: ['M21 12a9 9 0 1 1-9-9 5 5 0 0 0 4 5 4 4 0 0 0 5 4Z', 'M7 8h.1M7 16h.1M15 17h.1'], dot: [9, 10, .5] },
  heart: { paths: ['M12 21 3.5 12.5a5.5 5.5 0 0 1 8.5-7 5.5 5.5 0 0 1 8.5 7Z'], dot: [9.5, 9, .5] },
  email: { paths: ['M3 5h18v14H3ZM3 5l9 8 9-8'], dot: [15, 13, .4] },
  sun: { paths: ['M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5'], dot: [6.5, 6.5, 1.1] },
  moon: { paths: ['M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z'], dot: [15, 3, .6] },
  plus: { paths: ['M12 4v16M4 12h16'] },
  close: { paths: ['m6 6 12 12M18 6 6 18'] },
  check: { paths: ['m4 12 5 5L20 6'] },
  right: { paths: ['m9 5 7 7-7 7'] },
  left: { paths: ['m15 5-7 7 7 7'] },
  arrowRight: { paths: ['M3 12h18m-7-7 7 7-7 7'] },
  arrowLeft: { paths: ['M21 12H3m7-7-7 7 7 7'] },
  filter: { paths: ['M3 6h18M6 12h12M9 18h6'] },
} satisfies Record<string, IconDrawing>;

export type BrandIconName = keyof typeof BRAND_ICONS;
const aliases: Record<string, BrandIconName> = {
  cog: 'settings', 'cog-outline': 'settings', 'home-outline': 'home',
  'message-text-outline': 'message', 'message-outline': 'message',
  'account-circle': 'account', 'account-circle-outline': 'account', 'account-outline': 'account',
  'bell-outline': 'bell', 'bell-badge-outline': 'bell',
  'briefcase-outline': 'jobs', briefcase: 'jobs', 'bank-outline': 'bank',
  'account-group-outline': 'team', 'lock-outline': 'lock', 'lock-reset': 'lock',
  headset: 'support', 'bug-outline': 'bug', 'star-outline': 'star',
  'file-document-outline': 'document', 'shield-lock-outline': 'shield',
  'cookie-outline': 'cookie', 'account-heart-outline': 'heart',
  'email-outline': 'email', 'white-balance-sunny': 'sun', 'weather-night': 'moon',
  'chevron-right': 'right', 'chevron-left': 'left',
  'arrow-right': 'arrowRight', 'arrow-left': 'arrowLeft', 'filter-variant': 'filter',
};

export function getBrandIcon(name: string): IconDrawing | undefined {
  const key = aliases[name] ?? name;
  return Object.prototype.hasOwnProperty.call(BRAND_ICONS, key)
    ? BRAND_ICONS[key as BrandIconName] : undefined;
}
