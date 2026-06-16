# ScrollPathLine

A tiny, dependency-free vanilla-JS component that draws a winding SVG line
through a set of anchor elements on your page. As the user scrolls, the line
reveals itself from top to bottom — handy for storytelling pages, timelines,
"journey" sections, and step-by-step layouts.

- No dependencies, ~6 KB of readable source.
- Works as a plain `<script>` global or as a CommonJS / AMD / bundler import.
- The line snakes through any elements you tag with `data-line`.
- Smooth, configurable curves; dashed or solid; any color.

---

## Installation

Copy `scroll-path-line.js` into your project (e.g. `public/js/`) and load it.

**Script tag**

```html
<script src="/js/scroll-path-line.js"></script>
```

**Bundler / ES module**

```js
import ScrollPathLine from './scroll-path-line.js';
```

---

## Quick start

1. Give your section a container and put some elements inside it. Tag every
   element the line should pass through with `data-line`.

```html
<section id="story">
  <div class="step" data-line>Step one</div>
  <div class="step" data-line>Step two</div>
  <div class="step" data-line>Step three</div>
</section>
```

2. Initialise the line, pointing it at the container.

```js
const line = new ScrollPathLine({
  container: '#story',
  color: '#ffd400',
  smooth: 0.22,
});
```

That's it. The line is drawn behind your content (`z-index: -1`) and reveals
as `#story` scrolls through the viewport.

---

## How a waypoint is positioned

Each `data-line` element becomes one point on the line. By default the point
sits at the **center** of the element. You can override the horizontal
position per element:

| Attribute        | Example                | Meaning                                            |
| ---------------- | ---------------------- | -------------------------------------------------- |
| `data-line`      | `data-line` or `data-line="1"` | Marks the element as a waypoint (required). An optional numeric **value** sets the connection order (see below). |
| `data-line-side` | `data-line-side="left"`| Put the point on the element's `left` or `right` edge instead of its center. |
| `data-line-x`    | `data-line-x="30%"` or `data-line-x="200"` | Force an exact x: a `%` of the container width, or a pixel value from the container's left edge. Overrides `data-line-side`. |

### Connection order

By default points are sorted **top-to-bottom** by their vertical position, so
the order of elements in the DOM doesn't matter.

To control the order yourself, give every waypoint a numeric `data-line` value:

```html
<div data-line="1">first</div>
<div data-line="3">third</div>
<div data-line="2">second</div>
```

When **every** waypoint has a numeric value, the line connects them in
ascending order of that value, regardless of their position on the page (it can
even run upward or zig-zag). If any waypoint is missing a numeric value, the
library falls back to the top-to-bottom sort for all of them.

---

## Options

Pass any of these to the constructor. Every option has a sensible default.

| Option       | Type                    | Default        | Description |
| ------------ | ----------------------- | -------------- | ----------- |
| `container`  | `HTMLElement \| string` | `<body>`       | The element the line is drawn over. Its height defines the line's length, and it acts as the positioning context. |
| `waypoints`  | `string`                | `'[data-line]'`| CSS selector for the anchor elements (searched inside `container`). |
| `color`      | `string`                | `'#ffd400'`    | Line color (any CSS color). |
| `width`      | `number`                | `6`            | Line thickness in pixels. |
| `dash`       | `string \| null`        | `'22 16'`      | SVG `stroke-dasharray` (`"dash gap"`). Use `''` or `null` for a solid line. |
| `cap`        | `string`                | `'round'`      | `stroke-linecap` and `stroke-linejoin`. |
| `smooth`     | `number`                | `0.22`         | Curve roundness. `0` = sharp corners, `~0.17` = tight, `~0.22` = elegant, `~0.30` = very round (may overshoot). |
| `anchor`     | `string`                | `'center'`     | Vertical anchor on each waypoint: `'center'`, `'top'`, or `'bottom'`. |
| `start`      | `number`                | `0`            | Lead-in, in viewport heights. Lets drawing begin before the container reaches the top of the viewport. |
| `end`        | `number`                | `0`            | Lead-out, in viewport heights. Lets drawing finish after the container leaves. |
| `scrollLength` | `number \| null`      | `null`         | If a number `N`, the library sizes the container's scroll area to `N` viewport heights, controlling how far you scroll to draw the whole line (higher = the line draws more slowly). `null` leaves the height to your own CSS. Re-applied on resize. |
| `zIndex`     | `number`                | `-1`           | z-index of the line layer. `-1` keeps it behind your content; use a positive value to put it on top. |
| `onProgress` | `function \| null`      | `null`         | Called on every scroll as `fn(progress)` with `progress` in `[0, 1]`. Useful for syncing other animations. |

---

## Methods

| Method      | Description |
| ----------- | ----------- |
| `refresh()` | Recompute the path geometry from the current waypoint positions and container size. Call this after layout changes the built-in `resize`/`load` listeners don't cover (waypoints added/removed, an accordion opening, async content). |
| `update()`  | Recompute only the reveal amount from the current scroll position. Called automatically on scroll; you rarely call it directly. |
| `destroy()` | Remove the SVG layer and detach all listeners. Use on teardown (e.g. an SPA route change). |

```js
// after adding new [data-line] elements:
line.refresh();

// when removing the section:
line.destroy();
```

---

## How it works

**Reveal.** Two paths share the same shape. The visible one is your (optionally
dashed) colored line. A second, solid white path lives inside an SVG `<mask>`
and is drawn progressively by animating its `stroke-dashoffset` from `1`
(hidden) to `0` (fully drawn). Because the mask path uses `pathLength="1"`, the
math is resolution-independent — no need to measure the real path length.

**Geometry.** Every `data-line` element is resolved to an `{x, y}` point in the
container's coordinate system, the points are ordered (top-to-bottom by
position, or by their numeric `data-line` value if all waypoints have one), and
a Catmull-Rom spline (converted to cubic Bézier segments) is drawn through them.
The `smooth` option controls how round the bends are.

**Progress.** On scroll, the revealed fraction is computed from the container's
position in the viewport:

```
progress = (start*vh - containerTop) / ((containerHeight - vh) + (start + end) * vh)
```

With `start = end = 0` this is simply how far you've scrolled through the
container: `0` at its top, `1` at its bottom.

---

## Notes & limitations

- The container should be **taller than the viewport** for the default progress
  to span the full `0 → 1` range (true for typical scroll sections). You can let
  the library handle this with the `scrollLength` option instead of CSS height.
- Built for **window scroll**. Internally-scrolling containers
  (`overflow: auto`) aren't supported out of the box.
- The library sets the container's `position` to `relative` **only if** it is
  currently `static`, and renders the line at `z-index: -1` by default (a
  background layer). Make sure your content paints above it (normal flow and
  positioned content both do).
- The line is rebuilt on `resize` and `load`; call `refresh()` yourself for any
  other layout change.

---

## Using it with Laravel / Blade

Drop `scroll-path-line.js` in `public/js/`, load it, add `data-line` to the
elements you want the line to pass through, and initialise it:

```blade
{{-- resources/views/story.blade.php --}}
<section id="story">
  @foreach ($steps as $step)
    <div class="step" data-line>{{ $step->title }}</div>
  @endforeach
</section>

<script src="{{ asset('js/scroll-path-line.js') }}"></script>
<script>
  new ScrollPathLine({ container: '#story' });
</script>
```

---

## License

MIT
