// ABOUTME: Validates feedback and screenshot payloads before they reach local storage.
// ABOUTME: Constrains identifiers, PNGs, annotation coordinates, and page metadata.
import { validProjectId } from "../src/context.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const validId = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (message) => {
  throw new HttpError(400, message);
};
const string = (value, name, max, fallback) => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.length > max)
    fail(`${name} must be a string of at most ${max} characters.`);
  return value;
};
const number = (value, name, min, max) => {
  if (!Number.isFinite(value) || value < min || value > max)
    fail(`${name} is outside the supported range.`);
  return value;
};
const date = (value, name) => {
  string(value, name, 40);
  if (!Number.isFinite(Date.parse(value)))
    fail(`${name} must be a valid timestamp.`);
  return new Date(value).toISOString();
};

export function validateProjectId(value) {
  if (!validProjectId(value))
    fail(
      "Invalid projectId. Use 1–80 letters, numbers, underscores, or hyphens.",
    );
  return value;
}

function context(value) {
  if (!value || typeof value !== "object") fail("Page context is required.");
  let url;
  try {
    url = new URL(string(value.url, "context.url", 16384));
  } catch {
    fail("context.url must be a complete URL.");
  }
  if (!["http:", "https:", "file:"].includes(url.protocol))
    fail("Unsupported page URL protocol.");
  return {
    url: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    query: Array.from(url.searchParams.entries()),
    title: string(value.title, "context.title", 1000, ""),
    referrer: string(value.referrer, "context.referrer", 16384, ""),
    userAgent: string(value.userAgent, "context.userAgent", 2000, ""),
    language: string(value.language, "context.language", 80, ""),
    timezone: string(value.timezone, "context.timezone", 100, ""),
    viewport: {
      width: number(value.viewport?.width, "viewport.width", 1, 16000),
      height: number(value.viewport?.height, "viewport.height", 1, 16000),
      devicePixelRatio: number(
        value.viewport?.devicePixelRatio,
        "viewport.devicePixelRatio",
        0.1,
        10,
      ),
    },
    scroll: {
      x: number(value.scroll?.x, "scroll.x", -10000000, 10000000),
      y: number(value.scroll?.y, "scroll.y", -10000000, 10000000),
    },
    capturedAt: date(value.capturedAt, "context.capturedAt"),
  };
}

export function decodePng(value, width, height) {
  if (
    typeof value !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    fail("Screenshots must be base64 PNG data URLs.");
  const bytes = Buffer.from(
    value.slice("data:image/png;base64,".length),
    "base64",
  );
  if (bytes.length > 8 * 1024 * 1024)
    throw new HttpError(413, "Each screenshot must be smaller than 8 MB.");
  if (
    bytes.length < 33 ||
    !bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    fail("Screenshot is not a PNG image.");
  if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height)
    fail("Screenshot dimensions do not match the capture.");
  return bytes;
}

function capture(value) {
  if (value === null || value === undefined) return null;
  const width = number(value.width, "capture.width", 1, 16000);
  const height = number(value.height, "capture.height", 1, 16000);
  if (!Number.isInteger(width) || !Number.isInteger(height))
    fail("Capture dimensions must be integers.");
  decodePng(value.original, width, height);
  decodePng(value.annotated, width, height);
  if (!Array.isArray(value.annotations) || value.annotations.length > 2000)
    fail("Invalid annotations.");
  let pointCount = 0;
  const annotations = value.annotations.map((stroke) => {
    if (
      !stroke ||
      !["pen", "highlight", "rectangle", "ellipse"].includes(stroke.tool)
    )
      fail("Invalid drawing tool.");
    if (
      typeof stroke.color !== "string" ||
      !/^#[a-f0-9]{6}$/i.test(stroke.color)
    )
      fail("Invalid drawing color.");
    if (
      !Array.isArray(stroke.points) ||
      !stroke.points.length ||
      stroke.points.length > 20000
    )
      fail("Invalid drawing points.");
    pointCount += stroke.points.length;
    if (pointCount > 100000) fail("Too many annotation points.");
    return {
      tool: stroke.tool,
      color: stroke.color,
      width: number(stroke.width, "stroke.width", 0.1, 16000),
      points: stroke.points.map((point) => ({
        x: number(point?.x, "point.x", 0, width),
        y: number(point?.y, "point.y", 0, height),
      })),
    };
  });
  return {
    original: value.original,
    annotated: value.annotated,
    annotations,
    width,
    height,
    context: context(value.context),
    capturedAt: date(value.capturedAt, "capture.capturedAt"),
  };
}

export function validateFeedback(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Feedback must be a JSON object.");
  if (value.schemaVersion !== 1) fail("Unsupported feedback schema version.");
  if (!validId(value.id)) fail("Feedback id must be a UUID.");
  const entry = {
    schemaVersion: 1,
    id: value.id.toLowerCase(),
    projectId: validateProjectId(value.projectId),
    createdAt: date(value.createdAt, "createdAt"),
    author: string(value.author, "author", 120, "Reviewer"),
    text: string(value.text, "text", 10000),
    capture: capture(value.capture),
    context: context(value.context),
  };
  if (!entry.text.trim() && !entry.capture)
    fail("Feedback needs a message or screenshot.");
  return entry;
}
