/*!
 * ScrollPathLine v1.0.0
 * A dependency-free, scroll-driven SVG line that snakes through a set of
 * anchor elements on the page and "draws" itself as the user scrolls.
 *
 * Works as a plain <script> global, or via CommonJS / AMD imports.
 * MIT License.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();          // CommonJS / bundlers (Vite, webpack, ...)
  } else if (typeof define === 'function' && define.amd) {
    define(factory);                     // AMD
  } else {
    root.ScrollPathLine = factory();     // <script> tag -> window.ScrollPathLine
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Clamp a number into the [min, max] range.
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  /**
   * Resolve a single anchor element to an {x, y} point expressed in the
   * container's own coordinate system (top-left of the container = 0,0).
   *
   * Horizontal position is decided in this order:
   *   1. data-line-x   -> explicit value: "120" (px) or "30%" (of container width)
   *   2. data-line-side -> "left" or "right" edge of the element
   *   3. (default)      -> horizontal center of the element
   *
   * @param {HTMLElement} el        The anchor element.
   * @param {DOMRect}     elRect    Result of el.getBoundingClientRect().
   * @param {DOMRect}     hostRect  Result of container.getBoundingClientRect().
   * @param {number}      hostWidth Container client width (used for "%" values).
   * @param {string}      anchorY   Vertical anchor: "center" | "top" | "bottom".
   * @returns {{x:number, y:number}}
   */
  function resolvePoint(el, elRect, hostRect, hostWidth, anchorY) {
    // ---- horizontal ----
    var x;
    var xAttr = el.getAttribute('data-line-x');
    var side = el.getAttribute('data-line-side');
    if (xAttr) {
      x = xAttr.trim().slice(-1) === '%'
        ? hostWidth * parseFloat(xAttr) / 100
        : parseFloat(xAttr);
    } else if (side === 'left') {
      x = elRect.left - hostRect.left;
    } else if (side === 'right') {
      x = elRect.right - hostRect.left;
    } else {
      x = elRect.left - hostRect.left + elRect.width / 2; // center (default)
    }

    // ---- vertical ----
    var top = elRect.top - hostRect.top;
    var y = anchorY === 'top'
      ? top
      : (anchorY === 'bottom' ? top + elRect.height : top + elRect.height / 2);

    return { x: x, y: y };
  }

  /**
   * Build a smooth SVG path string through a list of points, using a
   * Catmull-Rom spline converted to cubic Bézier segments. The spline
   * passes exactly through every point.
   *
   * @param {Array<{x:number,y:number}>} pts   Points, ordered top -> bottom.
   * @param {number} smooth  Curve tension / roundness:
   *                           0     -> straight line segments (sharp corners)
   *                           ~0.17 -> tight, natural curves
   *                           ~0.22 -> rounder, more elegant (default)
   *                           ~0.30 -> very round (may slightly overshoot)
   * @returns {string} A value for the <path> "d" attribute.
   */
  function smoothPath(pts, smooth) {
    if (pts.length < 2) return '';
    var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1) + ' ';
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];   // previous point (or current at the start)
      var p1 = pts[i];                 // segment start
      var p2 = pts[i + 1];             // segment end
      var p3 = pts[i + 2] || p2;       // next point (or end at the finish)
      // Control points derived from the neighbouring points' direction.
      var c1x = p1.x + (p2.x - p0.x) * smooth;
      var c1y = p1.y + (p2.y - p0.y) * smooth;
      var c2x = p2.x - (p3.x - p1.x) * smooth;
      var c2y = p2.y - (p3.y - p1.y) * smooth;
      d += 'C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ', '
                + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ', '
                + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1) + ' ';
    }
    return d;
  }

  /**
   * Default options. Every option can be overridden per instance.
   * @type {Object}
   */
  var DEFAULTS = {
    container: null,          // HTMLElement | CSS selector. Defaults to <body>.
    waypoints: '[data-line]', // CSS selector for the anchor elements (searched inside the container).
    color: '#ffd400',         // Line color (any CSS color).
    width: 6,                 // Line thickness in px.
    dash: '22 16',            // SVG stroke-dasharray ("dash gap"). Use '' or null for a solid line.
    cap: 'round',             // stroke-linecap AND stroke-linejoin.
    smooth: 0.22,             // Curve roundness; see smoothPath().
    anchor: 'center',         // Vertical anchor on each waypoint: 'center' | 'top' | 'bottom'.
    start: 0,                 // Lead-in, in viewport heights; see update().
    end: 0,                   // Lead-out, in viewport heights; see update().
    scrollLength: null,       // If a number N, the container's scroll area is sized to N viewport heights, controlling how far you scroll to draw the line (higher = slower). null = leave the height to your CSS.
    zIndex: -1,               // z-index of the line layer (-1 = behind your content).
    onProgress: null          // Optional callback, called as fn(progress) with progress in [0,1].
  };

  /**
   * Create a scroll-driven line over a container.
   *
   * @class
   * @param {Object} [options] See DEFAULTS for every available option.
   *
   * @example
   *   const line = new ScrollPathLine({
   *     container: '#story',
   *     color: '#ffd400',
   *     smooth: 0.22,
   *   });
   */
  function ScrollPathLine(options) {
    // Merge user options over the defaults (shallow).
    var o = {};
    var k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (options || {})) o[k] = options[k];
    this.options = o;

    // Resolve the container element.
    this.container = typeof o.container === 'string'
      ? document.querySelector(o.container)
      : (o.container || document.body);
    if (!this.container) {
      throw new Error('ScrollPathLine: container not found.');
    }

    this._build();

    // Listeners. We recompute geometry on resize/load and the reveal on scroll.
    this._onScroll = this.update.bind(this);
    this._onResize = this.refresh.bind(this);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize);
    window.addEventListener('load', this._onResize); // re-measure once fonts/images settle

    this.refresh();
  }

  /**
   * Create the SVG layer: an absolutely-positioned wrapper containing one
   * visible (optionally dashed) line and a reveal mask. Called once.
   * @private
   */
  ScrollPathLine.prototype._build = function () {
    var o = this.options;

    // The container must establish a positioning context so the absolute
    // SVG layer is placed relative to it. Add one only if it has none.
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    var wrap = document.createElement('div');
    wrap.style.cssText =
      'position:absolute;top:0;left:0;width:100%;pointer-events:none;z-index:' + o.zIndex + ';';

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('fill', 'none');
    svg.style.cssText = 'width:100%;height:100%;display:block;overflow:visible;';

    // Unique mask id so multiple instances on one page don't collide.
    var maskId = 'spl-mask-' + Math.random().toString(36).slice(2);
    var defs = document.createElementNS(SVG_NS, 'defs');
    var mask = document.createElementNS(SVG_NS, 'mask');
    mask.setAttribute('id', maskId);

    // Mask path: a solid white stroke, wide enough to fully reveal the
    // visible line. It "draws" by animating stroke-dashoffset from 1 to 0.
    var maskPath = document.createElementNS(SVG_NS, 'path');
    maskPath.setAttribute('pathLength', '1');           // resolution-independent length
    maskPath.setAttribute('stroke', '#fff');            // white = visible area in a mask
    maskPath.setAttribute('stroke-width', String(o.width * 5));
    maskPath.setAttribute('stroke-linecap', o.cap);
    maskPath.setAttribute('stroke-linejoin', o.cap);
    maskPath.setAttribute('fill', 'none');
    maskPath.setAttribute('stroke-dasharray', '1 1');
    maskPath.setAttribute('stroke-dashoffset', '1');    // 1 = hidden, 0 = fully drawn

    // Visible line, revealed through the mask.
    var line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('stroke', o.color);
    line.setAttribute('stroke-width', String(o.width));
    line.setAttribute('stroke-linecap', o.cap);
    line.setAttribute('stroke-linejoin', o.cap);
    line.setAttribute('fill', 'none');
    if (o.dash) line.setAttribute('stroke-dasharray', o.dash);
    line.setAttribute('mask', 'url(#' + maskId + ')');

    mask.appendChild(maskPath);
    defs.appendChild(mask);
    svg.appendChild(defs);
    svg.appendChild(line);
    wrap.appendChild(svg);
    this.container.appendChild(wrap);

    // Keep references for later updates.
    this.wrap = wrap;
    this.svg = svg;
    this.line = line;
    this.maskPath = maskPath;
  };

  /**
   * Recompute the path geometry from the current waypoint positions and
   * container size. Call this after any layout change that the built-in
   * resize/load listeners don't cover (e.g. waypoints added or removed,
   * an accordion opening, content loaded asynchronously).
   */
  ScrollPathLine.prototype.refresh = function () {
    var o = this.options;

    // Optionally size the scroll area to N viewport heights. This decides how
    // far the user scrolls to draw the whole line. Recomputed here so it tracks
    // viewport resizes (refresh runs on resize), and based on the viewport
    // height (not the measured height) so it never compounds.
    if (typeof o.scrollLength === 'number') {
      var vhForLen = window.innerHeight || document.documentElement.clientHeight;
      this.container.style.height = (o.scrollLength * vhForLen) + 'px';
    }

    var hostRect = this.container.getBoundingClientRect();
    var hostWidth = this.container.clientWidth;
    var hostHeight = this.container.scrollHeight;

    // Collect the waypoints. Each may carry an explicit order in its
    // data-line value (e.g. data-line="1"); we read it alongside the point.
    var els = this.container.querySelectorAll(o.waypoints);
    var pts = [];
    var allOrdered = els.length > 0;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      var pt = resolvePoint(els[i], r, hostRect, hostWidth, o.anchor);
      var ordAttr = els[i].getAttribute('data-line');
      var ord = parseFloat(ordAttr);
      pt.order = isNaN(ord) ? null : ord;
      if (pt.order === null) allOrdered = false;
      pts.push(pt);
    }

    // If every waypoint declares a numeric order, connect them in that
    // order; otherwise fall back to top -> bottom by vertical position.
    pts.sort(allOrdered
      ? function (a, b) { return a.order - b.order; }
      : function (a, b) { return a.y - b.y; });

    // Size the SVG to the full container.
    this.wrap.style.height = hostHeight + 'px';
    this.svg.setAttribute('viewBox', '0 0 ' + hostWidth + ' ' + hostHeight);
    this.svg.setAttribute('width', hostWidth);
    this.svg.setAttribute('height', hostHeight);

    // Apply the same path to both the visible line and the reveal mask.
    var d = smoothPath(pts, o.smooth);
    this.line.setAttribute('d', d);
    this.maskPath.setAttribute('d', d);

    this.update();
  };

  /**
   * Recompute how much of the line is revealed, based on scroll position.
   *
   *   progress = (start*vh - containerTop)
   *            / ((containerHeight - vh) + (start + end) * vh)
   *
   * With start = end = 0 this is simply how far you've scrolled through the
   * container: 0 at its top, 1 at its bottom. `start` and `end` (in viewport
   * heights) add a lead-in / lead-out, so drawing can begin before the
   * container reaches the top of the viewport and finish after it leaves.
   *
   * Called automatically on scroll; you normally don't call it yourself.
   */
  ScrollPathLine.prototype.update = function () {
    var o = this.options;
    var cr = this.container.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var range = (cr.height - vh) + (o.start + o.end) * vh;
    var raw = range > 0
      ? (o.start * vh - cr.top) / range
      : (cr.top < vh ? 1 : 0); // container shorter than the viewport: full when in view
    var p = clamp(raw, 0, 1);
    this.maskPath.style.strokeDashoffset = String(1 - p);
    if (typeof o.onProgress === 'function') o.onProgress(p);
  };

  /**
   * Remove the SVG layer and detach every listener. Use this when the
   * component or page section is torn down (SPA route change, etc.).
   */
  ScrollPathLine.prototype.destroy = function () {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('load', this._onResize);
    if (this.wrap && this.wrap.parentNode) {
      this.wrap.parentNode.removeChild(this.wrap);
    }
  };

  return ScrollPathLine;
}));
