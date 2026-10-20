const wrap = (inner) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  temple: wrap('<path d="M12 2v3M8 9l4-4 4 4M6 9h12v3H6zM7 12v8M17 12v8M4 20h16M10 20v-4h4v4"/>'),
  mosque: wrap('<path d="M12 3c3 2 5 4 5 7H7c0-3 2-5 5-7zM6 10h12v10H6zM10 20v-4a2 2 0 0 1 4 0v4M3 20V9M3 9l.5-2M21 20V9"/>'),
  church: wrap('<path d="M12 2v5M10 4h4M8 11l4-4 4 4v9H8zM4 20h16M11 20v-3h2v3"/>'),
  fuel: wrap('<path d="M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M3 20h12M6 7h6M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/>'),
  tree: wrap('<path d="M12 22v-7M12 15c-4 0-7-2.5-7-6a5 5 0 0 1 4-4.9A4 4 0 0 1 12 3a4 4 0 0 1 3 1.1A5 5 0 0 1 19 9c0 3.5-3 6-7 6zM9 18l3-3 3 3"/>'),
  bakery: wrap('<path d="M4 15c0-5 3.5-8 8-8s8 3 8 8v3H4zM8 11v3M12 10v4M16 11v3"/>'),
  sweets: wrap('<circle cx="12" cy="12" r="5"/><path d="M7 12l-4-3v6zM17 12l4-3v6zM10 10l4 4"/>'),
  bank: wrap('<path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18"/>'),
  school: wrap('<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6"/>'),
  hospital: wrap('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  post: wrap('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  cafe: wrap('<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3"/>'),
  shop: wrap('<path d="M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-6 0 3 3 0 0 1-4 0 3 3 0 0 1-6 0zM5 13v7h14v-7M10 20v-4h4v4"/>'),
  pin: wrap('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
};

export function iconFor(name) {
  return ICONS[name] || ICONS.pin;
}
