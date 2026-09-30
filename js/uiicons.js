// v49 (review #61, David: "Replace emoji icons with a cohesive custom icon set"): the game's own interface icons, one
// style for all of them (24x24, round 2.2 strokes in the text colour, a few solid shapes). Drawn here as SVG paths, no
// font or image files. B.UI.i(name, cls) returns the <svg> markup; the logo mark is B.UI.mark().
(function (G) {
  const B = G.B = G.B || {};
  const P = {
    play: '<path d="M8 4.8v14.4a.8.8 0 0 0 1.2.7l11.2-7.2a.8.8 0 0 0 0-1.4L9.2 4.1A.8.8 0 0 0 8 4.8z" fill="currentColor" stroke="none"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    bulb: '<path d="M9.5 17.5h5M10.3 20.5h3.4M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5.9 1.1.9 1.8v1.7h5v-1.7c0-.7.3-1.3.9-1.8A5.8 5.8 0 0 0 12 3.5z"/>',
    trophy: '<path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z" fill="currentColor" fill-opacity=".25"/><path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0zM7.5 6H4.5a3.5 3.5 0 0 0 3.6 4.4M16.5 6h3a3.5 3.5 0 0 1-3.6 4.4M12 14v3.5M8 20.5h8M9.5 20.5l.8-3h3.4l.8 3"/>',
    crown: '<path d="M3.5 8.5l4.2 3.6L12 5l4.3 7.1 4.2-3.6-1.8 10H5.3z" fill="currentColor" fill-opacity=".3"/><path d="M3.5 8.5l4.2 3.6L12 5l4.3 7.1 4.2-3.6-1.8 10H5.3zM5.5 21h13"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/>',
    palette: '<path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1 0 1.5-.7 1.5-1.5 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.5 1.5-1.5h1.8a5 5 0 0 0 5-5c0-4-4-7.2-8.8-7.2z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor"/><circle cx="10" cy="7.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="7.5" r="1.2" fill="currentColor"/>',
    flag: '<path d="M5.5 21V3.5"/><path d="M5.5 4h12l-2.5 4.2 2.5 4.3h-12" fill="currentColor" fill-opacity=".9"/>',
    sword: '<path d="M19.5 3.5l-.6 3.6L9.5 16.5l-2-2 9.4-9.4zM6 13l5 5M7.8 16.2l-3.3 3.3"/>',
    swords: '<path d="M3.5 3.5l.6 3.6 9.4 9.4 2-2-9.4-9.4zM20.5 3.5l-.6 3.6-5.2 5.2M9.3 12.7l-2.8 2.8M18 13l-5 5M6 13l5 5M16.2 16.2l3.3 3.3M7.8 16.2l-3.3 3.3"/>',
    bow: '<path d="M6 3.5c7.5 1.2 13.3 7 14.5 14.5"/><path d="M6 3.5L20.5 18M4 12l6-6M10 6H6.5M10 6v3.5" stroke-width="1.8"/>',
    shield: '<path d="M12 3l7.5 2.8v5.7c0 4.6-3.2 7.9-7.5 9.3-4.3-1.4-7.5-4.7-7.5-9.3V5.8z" fill="currentColor" fill-opacity=".25"/><path d="M12 3l7.5 2.8v5.7c0 4.6-3.2 7.9-7.5 9.3-4.3-1.4-7.5-4.7-7.5-9.3V5.8z"/>',
    bag: '<path d="M5.5 8.5h13l-1 11.5h-11z" fill="currentColor" fill-opacity=".25"/><path d="M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    cart: '<path d="M3 4.5h2.3l2.3 10.5h10.2L20 7.5H6.5"/><circle cx="9" cy="19" r="1.4" fill="currentColor"/><circle cx="17" cy="19" r="1.4" fill="currentColor"/>',
    skull: '<path d="M12 3.5a7.5 7.5 0 0 0-4.5 13.5v3.5h9V17A7.5 7.5 0 0 0 12 3.5z" fill="currentColor" fill-opacity=".25"/><path d="M12 3.5a7.5 7.5 0 0 0-4.5 13.5v3.5h9V17A7.5 7.5 0 0 0 12 3.5zM10.5 20.5v-2M13.5 20.5v-2"/><circle cx="9.3" cy="11.5" r="1.6" fill="currentColor"/><circle cx="14.7" cy="11.5" r="1.6" fill="currentColor"/>',
    gem: '<path d="M6.5 4h11l3.5 5-9 11L3 9z" fill="currentColor" fill-opacity=".25"/><path d="M6.5 4h11l3.5 5-9 11L3 9zM3 9h18M9 4l3 16 3-16"/>',
    map: '<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    star: '<path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
    refresh: '<path d="M19.5 11.5a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v5h-5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" fill-opacity=".3"/><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.7" r=".7" fill="currentColor"/>',
    chart: '<path d="M4 20.5h16M6.5 20.5v-6M11 20.5V6.5M15.5 20.5v-9M20 20.5v-4" stroke-width="2.6"/>',
    up: '<path d="M12 20V5M5.5 11.5L12 5l6.5 6.5"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" fill="currentColor"/>',
    bolt: '<path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z" fill="currentColor"/>',
    gamepad: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor"/><circle cx="17.5" cy="13.8" r="1" fill="currentColor"/>',
    warn: '<path d="M12 3.5l9.5 16.5h-19z" fill="currentColor" fill-opacity=".25"/><path d="M12 3.5l9.5 16.5h-19zM12 10v4.5"/><circle cx="12" cy="17.3" r=".7" fill="currentColor"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    muscle: '<path d="M4 17.5c3-1.5 6.5-1.5 10 0 2.5 1 5.5.2 6.2-2.3.8-3-1.6-5.2-4.2-4.2l-1 .4-1.8-5.2c-.5-1.3-2-1.9-3.2-1.2L7.5 6.5l1 2.5 2.5-.8.8 3.3C8.5 12 5.5 13.5 4 17.5z" fill="currentColor" fill-opacity=".3"/><path d="M4 17.5c3-1.5 6.5-1.5 10 0 2.5 1 5.5.2 6.2-2.3.8-3-1.6-5.2-4.2-4.2l-1 .4-1.8-5.2c-.5-1.3-2-1.9-3.2-1.2L7.5 6.5l1 2.5 2.5-.8.8 3.3C8.5 12 5.5 13.5 4 17.5z"/>',
    ghost: '<path d="M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5l-2.2-1.6-2.1 1.6-2.2-1.6-2.1 1.6-2.2-1.6z" fill="currentColor" fill-opacity=".25"/><path d="M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5l-2.2-1.6-2.1 1.6-2.2-1.6-2.1 1.6-2.2-1.6z"/><circle cx="9.7" cy="11" r="1.1" fill="currentColor"/><circle cx="14.3" cy="11" r="1.1" fill="currentColor"/>',
  };
  const i = (name, cls) => P[name] ? `<svg class="ui${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>` : '';
  // the Super Rogues mark: a star badge wearing a rogue's mask (v49, review #60)
  const mark = (cls) => `<svg class="mark${cls ? ' ' + cls : ''}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 3l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 41.8l-15.2 8 2.9-16.9L7.4 20.9l17-2.5z" fill="#ffd23f" stroke="#1a1f6b" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M13 27.5c6-3.2 12.5-3 19 1.2 6.5-4.2 13-4.4 19-1.2-1 6.8-5.4 10.3-11 9.8-3.2-.3-5.6-2-8-4.3-2.4 2.3-4.8 4-8 4.3-5.6.5-10-3-11-9.8z" fill="#1a1f6b"/>
    <ellipse cx="23.5" cy="30.8" rx="4" ry="2.6" fill="#fff"/><ellipse cx="40.5" cy="30.8" rx="4" ry="2.6" fill="#fff"/>
    <path d="M12 27.8c-2.4-.2-4.3.6-5.6 2.4M52 27.8c2.4-.2 4.3.6 5.6 2.4" stroke="#1a1f6b" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`;
  B.UI = { i, mark, names: Object.keys(P) };
  if (typeof module !== 'undefined') module.exports = B.UI;
})(typeof window !== 'undefined' ? window : globalThis);
