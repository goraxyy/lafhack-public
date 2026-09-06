"use client";

import { useEffect, useRef } from 'react';

/**
 * A one-shot burst of maroon confetti, drawn on a canvas over the whole page.
 *
 * Written here rather than pulled in as a dependency: it is one canvas, one
 * animation frame loop and about sixty lines, against a package that would
 * ship a physics engine to throw paper at someone.
 *
 * Fires once on mount and removes itself when the last piece is off screen, so
 * it never sits burning frames behind a page the visitor has moved on from.
 * Skipped entirely for anyone who has asked for reduced motion -- a burst of
 * moving shapes is exactly what that setting is about.
 */

/** Maroon through to a pale rose, so the burst reads as one colour with depth. */
const COLOURS = ['#910029', '#B00232', '#C7304F', '#DE6076', '#F0A6B3'];

const PIECES = 90;
const GRAVITY = 0.12;
const DRAG = 0.994;

interface Piece {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  colour: string;
}

export function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const context = element.getContext('2d');
    if (!context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    function size() {
      if (!element) return;
      width = window.innerWidth;
      height = window.innerHeight;
      element.width = Math.floor(width * ratio);
      element.height = Math.floor(height * ratio);
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    size();
    window.addEventListener('resize', size);

    // Thrown up and outward from two points near the top, the way a pair of
    // party poppers would, rather than rained straight down from the ceiling.
    const pieces: Piece[] = Array.from({ length: PIECES }, (_, index) => {
      const fromLeft = index % 2 === 0;

      return {
        x: width * (fromLeft ? 0.2 : 0.8) + (Math.random() - 0.5) * width * 0.25,
        y: height * 0.18 + Math.random() * height * 0.1,
        width: 5 + Math.random() * 5,
        height: 8 + Math.random() * 6,
        vx: (fromLeft ? 1 : -1) * (0.4 + Math.random() * 2.6),
        vy: -(3 + Math.random() * 5),
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.28,
        colour: COLOURS[index % COLOURS.length],
      };
    });

    let frame = 0;

    function draw() {
      if (!context) return;
      context.clearRect(0, 0, width, height);

      let live = 0;

      for (const piece of pieces) {
        piece.vy += GRAVITY;
        piece.vx *= DRAG;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.angle += piece.spin;

        if (piece.y - piece.height > height) continue;
        live += 1;

        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.angle);
        context.fillStyle = piece.colour;
        // Scaling the height by the spin fakes the flip of a real paper
        // rectangle catching the light edge-on.
        context.fillRect(
          -piece.width / 2,
          -piece.height / 2,
          piece.width,
          piece.height * Math.abs(Math.cos(piece.angle))
        );
        context.restore();
      }

      if (live === 0) {
        context.clearRect(0, 0, width, height);
        return;
      }

      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', size);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
}
