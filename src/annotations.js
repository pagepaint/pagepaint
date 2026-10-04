// ABOUTME: Draws pen, highlighter, rectangle, and ellipse annotations over a capture.
// ABOUTME: Tracks editable strokes with pointer input and reversible undo and redo.
export class AnnotationCanvas {
  constructor(
    canvas,
    image,
    annotations = [],
    onChange = () => {},
    { showBackground = true, getTarget = () => null } = {},
  ) {
    this.canvas = canvas;
    this.image = image;
    this.annotations = structuredClone(annotations);
    this.redoStack = [];
    this.tool = "pen";
    this.color = "#ef4444";
    this.onChange = onChange;
    this.showBackground = showBackground;
    this.getTarget = getTarget;
    this.listeners = new AbortController();
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.addEventListener("pointerdown", (event) => this.start(event), {
      signal: this.listeners.signal,
    });
    canvas.addEventListener("pointermove", (event) => this.move(event), {
      signal: this.listeners.signal,
    });
    canvas.addEventListener("pointerup", (event) => this.end(event), {
      signal: this.listeners.signal,
    });
    canvas.addEventListener(
      "pointercancel",
      () => {
        this.active = null;
        this.render();
      },
      { signal: this.listeners.signal },
    );
    this.render();
  }

  point(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          this.canvas.width,
          ((event.clientX - bounds.left) * this.canvas.width) / bounds.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          this.canvas.height,
          ((event.clientY - bounds.top) * this.canvas.height) / bounds.height,
        ),
      ),
    };
  }

  start(event) {
    if (event.button !== 0 || this.active) return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    const scale = this.canvas.width / this.canvas.getBoundingClientRect().width;
    this.active = {
      tool: this.tool,
      selector: this.getTarget(event.clientX, event.clientY),
      color: this.color,
      width: (this.tool === "highlight" ? 22 : 3) * scale,
      points: [this.point(event)],
    };
    this.render();
  }

  move(event) {
    if (!this.active || event.pointerId !== this.pointerId) return;
    const point = this.point(event);
    if (["pen", "highlight"].includes(this.active.tool))
      this.active.points.push(point);
    else this.active.points[1] = point;
    this.render();
  }

  end(event) {
    if (!this.active || event.pointerId !== this.pointerId) return;
    this.move(event);
    this.annotations.push(this.active);
    this.active = null;
    this.redoStack = [];
    this.render();
    this.onChange();
  }

  render() {
    const context = this.canvas.getContext("2d");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.showBackground) context.drawImage(this.image, 0, 0);
    for (const stroke of [
      ...this.annotations,
      ...(this.active ? [this.active] : []),
    ]) {
      context.save();
      context.strokeStyle = context.fillStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.lineCap = context.lineJoin = "round";
      context.globalAlpha = stroke.tool === "highlight" ? 0.32 : 1;
      const [start, finish = start] = stroke.points;
      context.beginPath();
      if (stroke.tool === "rectangle")
        context.rect(start.x, start.y, finish.x - start.x, finish.y - start.y);
      else if (stroke.tool === "ellipse")
        context.ellipse(
          (start.x + finish.x) / 2,
          (start.y + finish.y) / 2,
          Math.abs(finish.x - start.x) / 2,
          Math.abs(finish.y - start.y) / 2,
          0,
          0,
          Math.PI * 2,
        );
      else if (stroke.points.length === 1) {
        context.arc(start.x, start.y, stroke.width / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.moveTo(start.x, start.y);
        stroke.points
          .slice(1)
          .forEach((point) => context.lineTo(point.x, point.y));
      }
      context.stroke();
      context.restore();
    }
  }

  undo() {
    if (this.annotations.length) {
      this.redoStack.push(this.annotations.pop());
      this.render();
      this.onChange();
    }
  }
  redo() {
    if (this.redoStack.length) {
      this.annotations.push(this.redoStack.pop());
      this.render();
      this.onChange();
    }
  }
  clear() {
    if (this.annotations.length) {
      this.annotations = [];
      this.redoStack = [];
      this.render();
      this.onChange();
    }
  }
  toDataURL() {
    if (this.showBackground) return this.canvas.toDataURL("image/png");
    const output = document.createElement("canvas");
    output.width = this.canvas.width;
    output.height = this.canvas.height;
    const context = output.getContext("2d");
    context.drawImage(this.image, 0, 0);
    context.drawImage(this.canvas, 0, 0);
    return output.toDataURL("image/png");
  }
  destroy() {
    this.listeners.abort();
  }
}
