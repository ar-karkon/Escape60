/* Original line icons (24 × 24, stroke = currentColor). */
const P = {
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" stroke="none"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M5.2 18.8l2.1-2.1M16.7 7.3l2.1-2.1"/><circle cx="12" cy="12" r="7"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M12 14v3M8 21h8M9 17h6"/>',
  car: '<path d="M3 15l2-5c.4-1 1.2-1.6 2.3-1.6h9.4c1.1 0 1.9.6 2.3 1.6l2 5v3h-2.5M3 15v3h2.5M3 15h18"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 14h3"/>',
  home: '<path d="M3 11l9-7 9 7M6 9.5V20h12V9.5"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8"/>',
  retry: '<path d="M4 12a8 8 0 108-8H8M8 4l3-3M8 4l3 3"/>',
  wrench: '<path d="M14.5 5.5a4 4 0 00-5 5L3.5 16.5a2.1 2.1 0 003 3l6-6a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  flame: '<path d="M12 3c1 3.5 5 5 5 10a5 5 0 01-10 0c0-2.5 1.5-4 2.5-5 0 2 1 3 2 3 0-3-1-5.5.5-8z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  left: '<path d="M14.5 5L7.5 12l7 7" stroke-width="3"/>',
  right: '<path d="M9.5 5l7 7-7 7" stroke-width="3"/>',
  bolt: '<path d="M13 2L5 13.5h6L10 22l9-12h-6.5z" fill="currentColor" stroke="none"/>',
  drift: '<path d="M4 17c3-1 4-4 8-4s5 2 8 1M6 9h5M13 7h5"/><circle cx="8" cy="17.5" r="1.4"/><circle cx="16" cy="15.5" r="1.4"/>',
  brake: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M5 5l2 2M19 19l-2-2"/>',
  siren: '<path d="M6 18v-5a6 6 0 0112 0v5M4 18h16v3H4zM12 3v2M4.5 6l1.5 1.5M19.5 6L18 7.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.6 5.4 3.6 8.5s-1 6.1-3.6 8.5c-2.6-2.4-3.6-5.4-3.6-8.5s1-6.1 3.6-8.5z"/>',
  spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/>',
  speed: '<path d="M4 16a8 8 0 1116 0M12 16l4-5"/>',
  sun: '<circle cx="12" cy="13" r="4"/><path d="M3 19h18M12 4v3M4.5 7.5l2 2M19.5 7.5l-2 2"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
};
export function iconSVG(name, cls = "") {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;
}
export function hydrateIcons(root = document) { for (const el of root.querySelectorAll("[data-icon]")) el.innerHTML = iconSVG(el.dataset.icon); }
