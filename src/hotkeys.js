// ABOUTME: Defines configurable keyboard shortcuts for feedback and drawing actions.
// ABOUTME: Normalizes combinations and matches physical letter keys across layouts.
export const HOTKEYS = [
  ["toggle", "Open / close feedback", "Alt+Shift+F"],
  ["draw-page", "Draw & capture", "Alt+Shift+D"],
  ["capture", "Screenshot", "Alt+Shift+S"],
  ["send", "Send feedback", "Mod+Enter"],
  ["undo", "Undo drawing", "Mod+Z"],
  ["redo", "Redo drawing", "Mod+Shift+Z"],
];
const MODIFIERS = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];

export function normalizeHotkey(value) {
  if (!value) return "";
  if (typeof value !== "string")
    throw new Error(
      "Use a shortcut combination or an empty string to disable it.",
    );
  const parts = value.split("+").map((part) => part.trim());
  const key = parts.pop();
  if (
    !key ||
    MODIFIERS.some((modifier) => modifier.toLowerCase() === key.toLowerCase())
  )
    throw new Error("Add a key to the shortcut combination.");
  const modifiers = parts.map((part) =>
    MODIFIERS.find((modifier) => modifier.toLowerCase() === part.toLowerCase()),
  );
  if (
    modifiers.includes(undefined) ||
    new Set(modifiers).size !== modifiers.length ||
    (modifiers.includes("Mod") &&
      (modifiers.includes("Ctrl") || modifiers.includes("Meta")))
  )
    throw new Error("Use Mod, Ctrl, Meta, Alt, and Shift once each.");
  if (
    !modifiers.some((modifier) =>
      ["Mod", "Ctrl", "Meta", "Alt"].includes(modifier),
    )
  )
    throw new Error(
      "Shortcuts need Ctrl, Command, or Alt so typing stays available.",
    );
  if (
    !/^[a-z0-9]$/i.test(key) &&
    ![
      "Enter",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Delete",
      "Backspace",
      "Space",
    ].includes(key)
  )
    throw new Error(
      "Choose a letter, number, Enter, arrow, Delete, Backspace, or Space.",
    );
  return [
    ...MODIFIERS.filter((modifier) => modifiers.includes(modifier)),
    key.length === 1 ? key.toUpperCase() : key,
  ].join("+");
}

export function hotkeySettings(overrides = {}) {
  const settings = Object.fromEntries(
    HOTKEYS.map(([action, , fallback]) => [
      action,
      normalizeHotkey(overrides[action] ?? fallback),
    ]),
  );
  const assigned = new Set();
  for (const shortcut of Object.values(settings)) {
    if (!shortcut) continue;
    const variants = shortcut.includes("Mod+")
      ? [shortcut.replace("Mod+", "Ctrl+"), shortcut.replace("Mod+", "Meta+")]
      : [shortcut];
    if (variants.some((variant) => assigned.has(variant)))
      throw new Error(`The shortcut ${shortcut} is assigned twice.`);
    for (const variant of variants) assigned.add(variant);
  }
  return settings;
}

function eventKey(event) {
  if (/^(Key[A-Z]|Digit[0-9])$/.test(event.code))
    return event.code.replace(/^(Key|Digit)/, "");
  return event.key === " "
    ? "Space"
    : event.key.length === 1
      ? event.key.toUpperCase()
      : event.key;
}

export function shortcutFromEvent(event) {
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push("Mod");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return normalizeHotkey([...modifiers, eventKey(event)].join("+"));
}

export function matchesHotkey(event, shortcut) {
  if (!shortcut) return false;
  const parts = shortcut.split("+");
  const key = parts.pop();
  return (
    eventKey(event) === key &&
    (parts.includes("Mod")
      ? event.ctrlKey !== event.metaKey
      : event.ctrlKey === parts.includes("Ctrl") &&
        event.metaKey === parts.includes("Meta")) &&
    event.altKey === parts.includes("Alt") &&
    event.shiftKey === parts.includes("Shift")
  );
}
