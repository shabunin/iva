import { Container, Rectangle, FederatedPointerEvent } from 'pixi.js';
import { CFNode } from '../parser';

const TAP_MOVE_THRESHOLD = 12; // px — max movement to still count as tap

interface GesturePoint {
  type: string;
  x: number;
  y: number;
  startx: number;
  starty: number;
  deltax: number;
  deltay: number;
  direction?: string;
  velocity?: number;
  /** iViewer context (partial) */
  join?: string | null;
  tokens?: Record<string, string>;
  list?: string | null;
  listIndex?: number | null;
}

/**
 * Bind CF GUI Designer gestures on a Pixi container.
 *
 * Gesture JS from the project receives a `gesture` object (iViewer-compatible subset).
 * Coordinates are **local to the object** (0,0 = top-left of container) — required for
 * demos like Dial `myDial.rotateToPoint(gesture.x, gesture.y)`.
 */
export function bindGestures(container: Container, gestures: CFNode[]) {
  if (!gestures || gestures.length === 0) return;

  // Ensure this container receives hits (child sprites often steal events otherwise)
  container.eventMode = 'static';
  container.interactiveChildren = false;
  ensureHitArea(container);

  let isPointerDown = false;
  let startLocalX = 0;
  let startLocalY = 0;
  let startTime = 0;

  const toLocal = (e: FederatedPointerEvent) => {
    const p = container.toLocal(e.global);
    return { x: p.x, y: p.y };
  };

  const buildGesture = (
    gestureNode: CFNode,
    type: string,
    x: number,
    y: number,
    extras?: Partial<GesturePoint>
  ): GesturePoint => {
    const g: GesturePoint = {
      type: type || gestureNode.attributes.type || 'pan',
      x,
      y,
      startx: startLocalX,
      starty: startLocalY,
      deltax: x - startLocalX,
      deltay: y - startLocalY,
      // Context: parent object join is not always known here; leave null unless set on node
      join: gestureNode.attributes.j || null,
      tokens: {},
      list: null,
      listIndex: null,
      ...extras,
    };
    return g;
  };

  const executeAction = (
    gestureNode: CFNode,
    phase: string,
    gesture: GesturePoint
  ) => {
    gestureNode.children.forEach((c) => {
      if (c.type !== 'action') return;
      if (c.attributes.phase !== phase) return;

      // Join-style action (no js): <action phase="begin" j="d10" value="1" />
      if (!c.attributes.js && c.attributes.j) {
        try {
          const cf = (window as any).CF;
          if (cf?.setJoin) {
            const raw = c.attributes.j;
            const join = /^[adsl]/i.test(raw) ? raw : 'd' + raw;
            const val = c.attributes.value ?? '1';
            cf.setJoin(join, val);
          }
        } catch (e) {
          console.error('Error in gesture join action:', e);
        }
        return;
      }

      if (!c.attributes.js) return;

      try {
        // iViewer wraps code in a function with locals join/tokens/list/listIndex/gesture.
        // We inject them as parameters so free identifiers resolve.
        const body = c.attributes.js;
        const fn = new Function(
          'gesture',
          'join',
          'tokens',
          'list',
          'listIndex',
          body
        );
        fn.call(
          window,
          gesture,
          gesture.join,
          gesture.tokens || {},
          gesture.list,
          gesture.listIndex
        );
      } catch (e) {
        console.error(`Error executing gesture action JS for phase ${phase}:`, e);
      }
    });
  };

  const forEachMatching = (
    types: string[],
    phase: string,
    x: number,
    y: number,
    extras?: Partial<GesturePoint>
  ) => {
    gestures.forEach((g) => {
      const t = (g.attributes.type || 'pan').toLowerCase();
      if (!types.includes(t)) return;

      // Optional direction filter (swipe)
      if (t === 'swipe' && g.attributes.direction && extras?.direction) {
        if (g.attributes.direction.toLowerCase() !== extras.direction.toLowerCase()) {
          return;
        }
      }

      executeAction(g, phase, buildGesture(g, t, x, y, extras));
    });
  };

  container.on('pointerdown', (e: FederatedPointerEvent) => {
    ensureHitArea(container);
    isPointerDown = true;
    const loc = toLocal(e);
    startLocalX = loc.x;
    startLocalY = loc.y;
    startTime = performance.now();

    // pan / press begin at touch-down
    forEachMatching(['pan'], 'begin', loc.x, loc.y);
    forEachMatching(['press'], 'begin', loc.x, loc.y);
    // swipe is recognized on release (with direction) — not here
  });

  container.on('pointermove', (e: FederatedPointerEvent) => {
    if (!isPointerDown) return;
    const loc = toLocal(e);
    // pan continuous tracking (Dial uses phase=change)
    forEachMatching(['pan'], 'change', loc.x, loc.y);
  });

  const pointerUpOrOutside = (e: FederatedPointerEvent) => {
    if (!isPointerDown) return;
    isPointerDown = false;

    const loc = toLocal(e);
    const dx = loc.x - startLocalX;
    const dy = loc.y - startLocalY;
    const dist = Math.hypot(dx, dy);

    // pan end
    forEachMatching(['pan'], 'end', loc.x, loc.y);

    // swipe: recognized on release if moved enough; phase begin is common in GUI Designer
    const direction = swipeDirection(dx, dy);
    if (dist >= TAP_MOVE_THRESHOLD * 2 && direction) {
      forEachMatching(['swipe'], 'begin', loc.x, loc.y, { direction });
      forEachMatching(['swipe'], 'end', loc.x, loc.y, { direction });
    }

    // tap: little movement (Dial: phase=begin on tap)
    if (dist < TAP_MOVE_THRESHOLD) {
      forEachMatching(['tap'], 'begin', loc.x, loc.y);
      forEachMatching(['tap'], 'end', loc.x, loc.y);
    }

    // press end
    forEachMatching(['press'], 'end', loc.x, loc.y);
  };

  container.on('pointerup', pointerUpOrOutside);
  container.on('pointerupoutside', pointerUpOrOutside);
  container.on('pointercancel', pointerUpOrOutside);
}

function ensureHitArea(container: Container) {
  // Prefer explicit size from layout (set by renderer via children bounds)
  try {
    const b = container.getLocalBounds();
    if (b.width > 0 && b.height > 0) {
      container.hitArea = new Rectangle(b.x, b.y, b.width, b.height);
      return;
    }
  } catch {
    /* ignore */
  }
  // Fallback: if width/height props set
  if ((container as any).width > 0 && (container as any).height > 0) {
    container.hitArea = new Rectangle(0, 0, (container as any).width, (container as any).height);
  }
}

function swipeDirection(dx: number, dy: number): string | undefined {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < TAP_MOVE_THRESHOLD && absY < TAP_MOVE_THRESHOLD) return undefined;
  if (absX >= absY) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
