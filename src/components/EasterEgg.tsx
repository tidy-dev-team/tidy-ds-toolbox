import { useCallback, useEffect, useRef, useState } from "react";

import easterEggVideo from "../assets/easter-egg-light.mp4";

const REQUIRED_CLICKS = 5;
const CLICK_WINDOW_MS = 2000;
const FADE_MS = 3000;

export function EasterEggVersion() {
  const [open, setOpen] = useState(false);
  const [backdropOpacity, setBackdropOpacity] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clickTimes = useRef<number[]>([]);
  const fadeRef = useRef<number>(0);

  const stopFade = useCallback(() => {
    if (fadeRef.current) {
      cancelAnimationFrame(fadeRef.current);
      fadeRef.current = 0;
    }
  }, []);

  const startFade = useCallback(() => {
    stopFade();
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / FADE_MS, 1);
      setBackdropOpacity(1 - progress);
      if (progress < 1) {
        fadeRef.current = requestAnimationFrame(tick);
      } else {
        fadeRef.current = 0;
      }
    };

    fadeRef.current = requestAnimationFrame(tick);
  }, [stopFade]);

  const handleClick = useCallback(() => {
    const now = Date.now();
    clickTimes.current = [
      ...clickTimes.current.filter((t) => now - t <= CLICK_WINDOW_MS),
      now,
    ];

    if (clickTimes.current.length >= REQUIRED_CLICKS) {
      clickTimes.current = [];
      setBackdropOpacity(1);
      setOpen(true);
    }
  }, []);

  const handleClose = useCallback(() => {
    stopFade();
    setOpen(false);
  }, [stopFade]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (
      !video ||
      !Number.isFinite(video.duration) ||
      video.duration === 0 ||
      fadeRef.current
    ) {
      return;
    }

    if (video.duration - video.currentTime <= FADE_MS / 1000) {
      startFade();
    }
  }, [startFade]);

  const handleEnded = useCallback(() => handleClose(), [handleClose]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => stopFade, [stopFade]);

  return (
    <>
      <span className="version easter-egg-trigger" onClick={handleClick}>
        v{__APP_VERSION__}
      </span>
      {open && (
        <div
          className="easter-egg-overlay"
          style={{ background: `rgba(0, 0, 0, ${0.75 * backdropOpacity})` }}
          onClick={handleClose}
          role="dialog"
          aria-label="Easter egg"
        >
          <video
            ref={videoRef}
            className="easter-egg-video"
            src={easterEggVideo}
            autoPlay
            controls
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
