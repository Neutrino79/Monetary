(function (global) {
  "use strict";

  // Each entry is the inner markup of a 24x24 stroke-based icon.
  const PATHS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    trendingUp: '<polyline points="3,17 9,11 13,15 21,6"/><polyline points="15,6 21,6 21,12"/>',
    trendingDown: '<polyline points="3,7 9,13 13,9 21,18"/><polyline points="21,11 21,18 15,18"/>',
    shuffle: '<polyline points="16,3 21,3 21,8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21,16 21,21 16,21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    users: '<circle cx="9" cy="8" r="3.3"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="8" r="2.6"/><path d="M16 14.3c2.7.5 4.5 2.6 4.5 5.7"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6.8 7.5-6.8s7.5 2.8 7.5 6.8"/>',
    landmark: '<line x1="3" y1="21" x2="21" y2="21"/><line x1="5" y1="21" x2="5" y2="10"/><line x1="10" y1="21" x2="10" y2="10"/><line x1="14" y1="21" x2="14" y2="10"/><line x1="19" y1="21" x2="19" y2="10"/><polygon points="12,3 21,9 3,9"/>',
    tag: '<path d="M20 12.6 12.6 20a2 2 0 0 1-2.8 0L4 14.2a2 2 0 0 1 0-2.8L11.4 4H19a1 1 0 0 1 1 1z"/><circle cx="15" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
    barChart: '<line x1="4" y1="21" x2="20" y2="21"/><rect x="6" y="12" width="3.4" height="9"/><rect x="12" y="7" width="3.4" height="14"/><rect x="18" y="3" width="0" height="0"/><rect x="17" y="4" width="0" height="0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>',
    search: '<circle cx="11" cy="11" r="7.2"/><line x1="21" y1="21" x2="16.2" y2="16.2"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="4.2" y1="4.2" x2="6" y2="6"/><line x1="18" y1="18" x2="19.8" y2="19.8"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.2" y1="19.8" x2="6" y2="18"/><line x1="18" y1="6" x2="19.8" y2="4.2"/>',
    moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
    menu: '<line x1="3.5" y1="6" x2="20.5" y2="6"/><line x1="3.5" y1="12" x2="20.5" y2="12"/><line x1="3.5" y1="18" x2="20.5" y2="18"/>',
    x: '<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>',
    chevronRight: '<polyline points="9,5 16,12 9,19"/>',
    chevronDown: '<polyline points="5,9 12,16 19,9"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    download: '<path d="M12 3v12"/><polyline points="7,10 12,15 17,10"/><line x1="4" y1="20" x2="20" y2="20"/>',
    upload: '<path d="M12 21V9"/><polyline points="7,14 12,9 17,14"/><line x1="4" y1="4" x2="20" y2="4"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    edit: '<path d="M4 20.5l.9-4L16.4 5a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.5 19.1l-4 .9z"/><line x1="14.5" y1="6.5" x2="17.9" y2="9.9"/>',
    trash: '<polyline points="4,7 20,7"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/><path d="M6 7l1 13.5A1.5 1.5 0 0 0 8.5 22h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    check: '<polyline points="4,13 9,18 20,6"/>',
    alert: '<path d="M12 3 22 20H2z"/><line x1="12" y1="9.5" x2="12" y2="14"/><line x1="12" y1="16.8" x2="12" y2="16.8"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none"/>',
    creditCard: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><line x1="2.5" y1="10" x2="21.5" y2="10"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5"/><line x1="3" y1="13" x2="21" y2="13"/>',
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v10h12V10"/>',
    filter: '<polygon points="4,4 20,4 14,12.5 14,19 10,21 10,12.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
    arrowRight: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14,6 20,12 14,18"/>',
    sparkle: '<path d="M12 2.5c.6 4 2.6 6 6.5 6.5-3.9.5-5.9 2.5-6.5 6.5-.6-4-2.6-6-6.5-6.5 3.9-.5 5.9-2.5 6.5-6.5z"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.4"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><line x1="10" y1="13" x2="14" y2="13"/>',
    banknote: '<rect x="2.5" y="6.5" width="19" height="11" rx="1.6"/><circle cx="12" cy="12" r="2.6"/><line x1="6" y1="9" x2="6" y2="9.01"/><line x1="18" y1="15" x2="18" y2="15.01"/>',
    handCoins: '<circle cx="8" cy="8" r="4"/><path d="M3.5 20c.5-3.5 2.6-5.4 4.5-5.4s4 1.9 4.5 5.4"/><path d="M13 15.5l4 1.4a1.6 1.6 0 0 1-.6 3.1h-5.4"/><line x1="14.5" y1="18" x2="19.5" y2="16.3"/>',
    scale: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="5" y1="7" x2="19" y2="7"/><path d="M5 7 2.5 13a2.7 2.7 0 0 0 5 0z"/><path d="M19 7l-2.5 6a2.7 2.7 0 0 0 5 0z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  };

  function icon(name, opts) {
    opts = opts || {};
    const size = opts.size || 18;
    const strokeW = opts.strokeWidth || 1.8;
    const path = PATHS[name] || PATHS.sparkle;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  global.Icons = { icon, names: Object.keys(PATHS) };
})(window);
