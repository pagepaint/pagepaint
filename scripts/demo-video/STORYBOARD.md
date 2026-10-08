# Pagepaint demo video

Promise: "Show the bug. Keep the context." Save feedback locally for developers and QA working on AI-built apps.
Look: smooth 60 fps, `paper: false`. Light neutral gray stage, black captions, a black highlight chip with white text. Neon yellow (`#edff3a`) appears only where the real widget uses it: the Feedback button, the primary buttons, the selected tool, the panel accents. The end card turns the stage black. Captions in DM Sans (`demo/fonts`), code and file names in the system monospace, the widget in its own system UI font.
Length: 264 units (22 s), 12 units a second. Poster at 104 (the yellow rectangle drawn around the broken button, page toolbar showing). Music ends at 222, the chord lands at 230 with the mark.
Placement: homepage hero, autoplay muted with an optional sound toggle. The captions carry the story.

The browser window shows a 680 × 555 viewport at 1.6× (1088 × 888 on the stage). The widget is rebuilt from `src/widget.js` markup, `src/styles.js` rules and `src/icons.js` paths at that viewport, so its layout is what the real panel does at that size.

| Beat     | Time    | Caption                              | What happens                                                                                                                                                                                                                                                                                                                                             | Sounds                                                  |
| -------- | ------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Script   | 0–29    | "Add _one_ script."                  | A code card lands on the right with the README embed: `<script src="https://pagepaint.dev/v0.4.0/pagepaint.js" data-pagepaint data-project="my-app" defer>`. Its lines tick in. The card flies up.                                                                                                                                                       | slide, ticks per line, whoosh                           |
| Bug      | 30–61   | "Find the _bug._"                    | A browser window rises with a grayscale checkout page, labelled "Sample fixture" in the tab. The neon Feedback button pops in bottom right. The "Pay $24.00" button overflows its card and its label is clipped. The cursor glides to it and circles the clipped edge.                                                                                   | slide, pop, whoosh                                      |
| Draw     | 62–111  | "Draw right on the _page._"          | The cursor clicks Feedback: the panel opens ("Leave a little feedback", empty thread, Area, YOUR FEEDBACK, Draw & capture, Send). It clicks Draw & capture: the panel hides and the page toolbar rises ("Draw on this page", Cancel, Capture & attach, tools, eight swatches). It picks Rectangle, then Yellow, and drags a rectangle around the button. | click, pop, slide, clicks, a rising tick                |
| Comment  | 112–157 | "Capture it. Say what's _wrong._"    | It clicks Capture & attach: a white flash, the toolbar leaves, the panel returns with "Screenshot attached". "Pay button is cut off. Keep it inside the card." types into YOUR FEEDBACK; Send lights up and is clicked.                                                                                                                                  | click, flash tap, ticks while typing, click             |
| Repo     | 158–183 | "Pick your _repo._"                  | The browser's folder picker (first save only) slides over the window. The cursor selects `checkout-app` and clicks Select. The picker leaves; the thread shows the note and the footer reads "Saved in repo".                                                                                                                                            | slide, clicks, whoosh, pop                              |
| Files    | 184–227 | "Saved _locally,_ with its context." | The window slides away. A folder card lands: `checkout-app/.annotations/` with `<id>.webp`, `<id>.original.webp` and `<id>.json`. The JSON card follows with its last fields: `url`, `viewport`, `shapes` (rectangle, `#eab308`), `comment` and `"status": "open"`.                                                                                      | slide, ticks per file, ticks per field, stamp on status |
| End card | 228–263 | none                                 | The stage turns black. The neon logo tile stamps in with the speech-bubble mark, "pagepaint.dev" lands letter by letter, then "Show the bug. Keep the context." and "Local feedback for AI-built apps." Held about 1.7 s.                                                                                                                                | stamp with the chord, taps per letter                   |

## Reads

- Script: caption 2–6, card 4–10, lines 8–14, held to 26.
- Bug: window 30–37, Feedback button 40, caption 34–40, cursor reaches the clipped label at 48, held to 58.
- Draw: Feedback click 62, panel 63–68, Draw & capture click 72, toolbar 74–80, Rectangle 83, Yellow 88, drag 92–101, held to 110.
- Comment: Capture & attach click 112, flash 112–115, panel with attachment 116–121, typing 122–146, Send click 152.
- Repo: picker 158–163, `checkout-app` 166, Select 172, picker out 174–177, "Saved in repo" 178, held to 183.
- Files: window out 182–187, folder card 186–192, files 190–196, JSON card 196–202, fields 200–210, status stamp 210, held to 226.
- End card: stage black 226–231, mark 230, wordmark 234–246, tagline 248, subline 252, held to 263.

## Accuracy notes

- Every label is the widget's own: "Feedback", "Leave a little feedback", "A note. A screenshot. A clearer next step.", "Good feedback starts here.", "Area (optional)", "e.g. Checkout", "YOUR FEEDBACK", "Draw & capture", "Send", "Draw on this page", "Draw, then capture.", "Cancel", "Capture & attach", "Screenshot attached", "Click to edit your marks", "Saved in repo", "Download ZIP", "Open".
- The video shows a returning user, so Feedback opens the conversation view, not the first-run accent picker.
- The drawing colour is the real "Yellow" swatch (`#eab308`). The default tool is the pen and the default colour red, so the cursor picks Rectangle and Yellow first. The neon `#edff3a` is the interface accent, never a drawing colour.
- The folder picker appears because the first Send calls `showDirectoryPicker` (`RepositoryStore.prepare`). The website gets only the folder the user picks. It is drawn as a plain neutral chooser, not a copy of an operating system dialog.
- File names follow `RepositoryStore.save`: `<id>.webp`, `<id>.original.webp`, `<id>.json` in `.annotations/`; the id is a shortened UUID. The JSON card shows the fields the save adds at the end of the record (`url`, `viewport`, `shapes`, `comment`, `status`); earlier fields and point coordinates are elided with `…`, not invented. The viewport matches the window: 680 × 555.
- No GitHub issue, upload or sign-in appears: OAuth configuration is pending.
- The checkout page is a sample fixture drawn for the video, labelled as such in the browser tab. Its URL is `http://localhost:5173/checkout`.
- Wordmark: lowercase "pagepaint" as on the shipped site header, with ".dev" in gray.
