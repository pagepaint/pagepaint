// ABOUTME: Styles the isolated feedback panel and responsive screenshot editor.
// ABOUTME: Uses scoped tokens and explicit control styles to withstand host page CSS.
export const styles = `
  :host { all: initial; --ink: #20332d; --muted: #66756e; --line: #e2e8e3; --paper: #fff; --wash: #f5f7f4; --accent: #285b49; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); color-scheme: light; }
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  .fab, .panel, dialog { pointer-events: auto; }
  button, textarea, input { font: inherit; }
  button { appearance: none; border: 0; padding: 0; color: inherit; background: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
  button:disabled { opacity: .4; cursor: not-allowed; }
  button:focus-visible, textarea:focus-visible, a:focus-visible, canvas:focus-visible { outline: 3px solid #568e78; outline-offset: 3px; }
  svg { flex: 0 0 auto; }
  .fab { position: fixed; min-width: 56px; height: 56px; padding: 0 19px; border-radius: 18px; color: white; background: var(--accent); box-shadow: 0 5px 18px #183a2924, 0 1px 3px #183a291f; z-index: 2147483646; font-weight: 600; letter-spacing: -.1px; transition: background .15s, transform .15s; }
  .fab:hover { background: #204b3c; transform: translateY(-2px); }
  .fab svg { width: 22px; height: 22px; }
  .panel { position: fixed; width: min(410px, calc(100vw - 32px)); height: min(670px, calc(100dvh - 110px)); min-height: 270px; display: flex; flex-direction: column; background: var(--paper); border: 1px solid #d8e1da; border-radius: 22px; box-shadow: 0 18px 80px #152b2924, 0 4px 15px #152b290f; z-index: 2147483646; overflow: hidden; }
  .panel-header { display: flex; align-items: center; justify-content: space-between; padding: 21px 22px 17px; }
  .brand { display: flex; align-items: center; gap: 11px; }
  .brand-mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 11px; background: #edf4ee; color: var(--accent); }
  h2, h3, p { margin: 0; }
  h2 { font-size: 16px; line-height: 1.4; font-weight: 650; letter-spacing: -.3px; }
  .subtitle { font-size: 11px; color: var(--muted); }
  .icon-button { width: 36px; height: 36px; border-radius: 9px; flex: 0 0 auto; }
  .icon-button:hover { background: #edf1ec; }
  .context-bar { display: flex; align-items: center; gap: 8px; padding: 10px 22px; background: var(--wash); border-block: 1px solid var(--line); font-size: 11px; color: var(--muted); }
  .context-bar svg { width: 14px; height: 14px; }
  .page-path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .messages { flex: 1; overflow: auto; overscroll-behavior: contain; padding: 20px; min-height: 0; }
  .empty { height: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 16px; }
  .empty-illustration { position: relative; display: grid; place-items: center; width: 67px; height: 67px; border: 1px solid #e0e8dc; border-radius: 20px; color: #568165; background: #f2f5ee; margin-bottom: 16px; transform: rotate(-6deg); }
  .empty-illustration svg { width: 28px; height: 28px; }
  .empty-illustration::after { content: ''; position: absolute; width: 13px; height: 13px; border-radius: 50%; background: #dfae61; border: 3px solid white; right: -4px; top: -4px; }
  .empty h3 { font-size: 16px; font-weight: 600; letter-spacing: -.2px; margin-bottom: 6px; }
  .empty p { color: var(--muted); font-size: 13px; max-width: 245px; }
  .message { margin-bottom: 18px; }
  .message-meta { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 10px; margin-bottom: 6px; }
  .avatar { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; background: #e9eee7; color: var(--accent); font-weight: 600; font-size: 10px; }
  .bubble { border-radius: 4px 13px 13px 13px; background: #f1f5ef; padding: 12px 14px; border: 1px solid #e8ede4; }
  .message-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
  .message-capture { width: 100%; margin-top: 9px; border-radius: 7px; overflow: hidden; border: 1px solid #d8dfd5; background: white; }
  .message-capture img { display: block; width: 100%; height: auto; max-height: 170px; object-fit: contain; }
  .message-path { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; margin-top: 7px; }
  .composer { padding: 14px 18px 16px; border-top: 1px solid var(--line); background: white; }
  .input-box { border: 1px solid #dce3da; border-radius: 12px; padding: 12px; transition: border-color .15s; }
  .input-box:focus-within { border-color: #648d73; }
  .input-label { display: block; font-size: 10px; font-weight: 600; color: var(--muted); margin-bottom: 5px; }
  textarea { display: block; width: 100%; border: 0; resize: none; background: transparent; color: var(--ink); line-height: 1.5; min-height: 60px; max-height: 140px; padding: 0; font-size: 13px; }
  textarea::placeholder { color: #869289; }
  textarea:focus-visible { outline: none; }
  .composer-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 9px; gap: 8px; }
  .capture-button { font-size: 11px; color: var(--accent); height: 34px; padding-inline: 7px; border-radius: 7px; }
  .capture-button:hover { background: #eef3ed; }
  .capture-button svg { width: 17px; height: 17px; }
  .capture-actions { display: flex; align-items: center; gap: 2px; }
  .capture-actions .icon-button { width: 29px; height: 32px; color: var(--accent); }
  .capture-actions .icon-button svg { width: 17px; height: 17px; }
  .primary { background: var(--accent); color: white; border-radius: 9px; padding: 10px 15px; font-weight: 550; font-size: 12px; min-height: 39px; }
  .primary:hover { background: #204b3c; }
  .primary svg { width: 16px; height: 16px; }
  .attachment { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; background: var(--wash); padding: 7px; border-radius: 9px; }
  .attachment-preview { border-radius: 5px; overflow: hidden; width: 58px; height: 41px; background: white; flex: 0 0 auto; }
  .attachment-preview img { width: 100%; height: 100%; object-fit: contain; }
  .attachment-copy { flex: 1; min-width: 0; }
  .attachment-copy strong { font-size: 11px; font-weight: 600; }
  .attachment-copy p { font-size: 10px; color: var(--muted); }
  .panel-footer { border-top: 1px solid var(--line); background: #fafbf8; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 11px 20px; }
  .save-status { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--muted); }
  .status-dot { width: 5px; height: 5px; border-radius: 50%; background: #648b6a; flex: 0 0 auto; }
  .save-status[data-warning] .status-dot { background: #be812c; }
  .export-button { font-size: 10px; gap: 5px; color: var(--accent); min-height: 30px; }
  .export-button svg { width: 13px; height: 13px; }
  .notice { padding: 9px 18px; font-size: 11px; color: #835315; background: #fffaea; border-bottom: 1px solid #eee3c5; }
  dialog { font: inherit; color: var(--ink); background: white; padding: 0; border: 1px solid #d9e0d9; border-radius: 20px; width: min(1120px, calc(100vw - 40px)); max-width: none; max-height: calc(100dvh - 40px); margin: auto; box-shadow: 0 20px 90px #122b2929; overflow: hidden; }
  dialog::backdrop { background: #14241bc2; backdrop-filter: blur(4px); }
  .editor { display: flex; flex-direction: column; max-height: calc(100dvh - 44px); }
  .editor-header { padding: 17px 23px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); }
  .editor-heading { min-width: 0; }
  .editor-heading p { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 65vw; }
  .editor-toolbar { padding: 10px 22px; display: flex; gap: 16px; flex-wrap: wrap; align-items: center; border-bottom: 1px solid var(--line); }
  .tool-group, .colors { display: flex; align-items: center; gap: 4px; }
  .tool { width: 38px; height: 38px; border-radius: 9px; color: #64746a; }
  .tool:hover { background: var(--wash); }
  .tool[aria-pressed=true] { background: #e8f0e6; color: var(--accent); box-shadow: inset 0 0 0 1px #cee0cc; }
  .divider { width: 1px; height: 24px; background: var(--line); }
  .swatch { width: 30px; height: 34px; border-radius: 7px; position: relative; }
  .swatch::before { content: ''; width: 18px; height: 18px; border-radius: 50%; background: var(--swatch); border: 1px solid #00000012; }
  .swatch[aria-pressed=true] { background: var(--wash); box-shadow: inset 0 0 0 1px #bac9be; }
  .swatch[aria-pressed=true]::before { box-shadow: 0 0 0 2px white, 0 0 0 3px var(--swatch); }
  .history { margin-left: auto; }
  .canvas-stage { background: #e9ede7; padding: 22px; min-height: 0; overflow: auto; display: flex; align-items: center; justify-content: center; flex: 1; }
  .canvas-stage canvas { display: block; max-width: 100%; max-height: min(61dvh, 740px); width: auto; height: auto; object-fit: contain; box-shadow: 0 2px 12px #1b2c2415; background: white; cursor: crosshair; touch-action: none; }
  .canvas-stage img { display: block; max-width: 100%; max-height: 70dvh; object-fit: contain; }
  .editor-footer { padding: 13px 23px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); gap: 12px; }
  .editor-hint { color: var(--muted); font-size: 11px; }
  .secondary { padding: 9px 13px; font-size: 12px; border-radius: 9px; border: 1px solid #d9e1d6; min-height: 39px; }
  .secondary:hover { background: var(--wash); }
  .editor-actions { display: flex; gap: 9px; }
  .viewer { padding: 18px; }
  .viewer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .viewer img { display: block; width: 100%; max-height: 75dvh; object-fit: contain; }
  .page-dialog { position: fixed; inset: 0; margin: 0; border: 0; border-radius: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; padding: 0; background: transparent; box-shadow: none; overflow: hidden; touch-action: none; }
  .page-dialog::backdrop { background: transparent; backdrop-filter: none; }
  .page-canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
  .page-toolbar { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); width: min(660px, calc(100vw - 24px)); background: white; border: 1px solid #d4dfd1; border-radius: 17px; box-shadow: 0 8px 40px #152b2926; }
  .page-toolbar-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 16px 11px; }
  .page-toolbar-heading h2 { font-size: 13px; }
  .page-toolbar-heading p { font-size: 10px; color: var(--muted); }
  .page-drawing-actions { display: flex; gap: 8px; }
  .page-toolbar .editor-toolbar { border-bottom: 0; border-top: 1px solid var(--line); padding: 9px 12px; gap: 9px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (max-width: 600px) {
    .fab { height: 52px; padding: 0 16px; border-radius: 16px; }
    .panel { width: calc(100vw - 24px); height: min(660px, calc(100dvh - 96px)); border-radius: 18px; }
    .panel-header { padding: 16px 18px; }
    dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); border-radius: 14px; }
    .editor { max-height: calc(100dvh - 20px); }
    .editor-header { padding: 14px; }
    .editor-toolbar { padding: 7px 10px; gap: 8px; }
    .colors { order: 3; width: 100%; justify-content: center; }
    .divider { display: none; }
    .tool { width: 39px; height: 39px; }
    .history { margin-left: auto; }
    .swatch { width: 34px; height: 38px; }
    .canvas-stage { padding: 12px; }
    .canvas-stage canvas { max-height: 48dvh; }
    .editor-footer { padding: 12px; }
    .editor-hint { display: none; }
    .editor-actions { width: 100%; justify-content: flex-end; }
    .page-dialog { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; }
    .page-toolbar { bottom: 12px; }
    .page-toolbar-heading { flex-wrap: wrap; padding: 11px 12px; gap: 9px; }
    .page-toolbar-heading > div:first-child { flex: 1; }
    .page-drawing-actions .primary, .page-drawing-actions .secondary { font-size: 10px; padding-inline: 10px; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
`;
