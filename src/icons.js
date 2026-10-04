// ABOUTME: Defines a consistent set of small SVG icons for the feedback widget.
// ABOUTME: Keeps icons decorative while their parent controls provide accessible names.
const paths = {
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5H5l-4 3V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M7 10h8M7 14h5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  camera:
    '<path d="M4 6h4l2-3h4l2 3h4a2 2 0 0 1 2 2v12H2V8a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/>',
  send: '<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  pen: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 7Z"/>',
  highlight: '<path d="m9 15 7-12 6 4-7 12-6-4ZM9 15l-4 3 5 3 5-2M2 22h12"/>',
  rectangle: '<rect x="3" y="5" width="18" height="14" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="8"/>',
  undo: '<path d="m9 4-6 6 6 6M3 10h10a7 7 0 0 1 7 7v3"/>',
  redo: '<path d="m15 4 6 6-6 6m6-6H11a7 7 0 0 0-7 7v3"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  link: '<path d="m10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(2 -1)"/>',
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.chat}</svg>`;
}
