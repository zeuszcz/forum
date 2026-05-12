"use client";

import Hls from "hls.js";
import { AlertTriangle, Loader2, Radio, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// LL-HLS endpoint served by MediaMTX behind nginx. `cs1` is the path we
// configured in mediamtx.yml.
const STREAM_URL = "/stream/cs1/index.m3u8";
// How long we wait before declaring the upstream pipeline dead. The
// stream can be cold-started on demand by the orchestrator (Phase S5),
// so we want a generous grace period before showing the offline state.
const COLD_START_GRACE_MS = 20_000;

type PlayerState = "idle" | "loading" | "playing" | "stalled" | "offline";

export function StreamPlayer({
  active,
  lowLatency = false,
}: {
  active: boolean;
  /**
   * Pilot mode flag. When true the HLS profile is re-tuned to the
   * tightest practical buffer (≈1 s end-to-end vs the default ≈4 s)
   * so WASD inputs surface fast enough to control the spec camera.
   * Stalls more often on jittery networks — that is the trade.
   */
  lowLatency?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [muted, setMuted] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // -------- lifecycle --------
  useEffect(() => {
    if (!active) {
      teardown();
      setState("idle");
      return;
    }
    // Keep the lowLatency flag in the effect deps so toggling pilot
    // mode tears down + rebuilds the HLS instance with the new
    // buffer profile.
    void lowLatency;

    const video = videoRef.current;
    if (!video) return;

    setState("loading");
    const offlineTimer = window.setTimeout(() => {
      setState((s) => (s === "loading" ? "offline" : s));
    }, COLD_START_GRACE_MS);

    if (Hls.isSupported()) {
      // Two tuning profiles:
      //
      //   default (lowLatency=false): smooth-playback. ~4 s wall-clock
      //   lag, big buffer absorbs 200 ms VPS hiccups without stalling.
      //   This is the right profile for casual viewing on /live.
      //
      //   lowLatency=true (pilot mode): aggressive. ~1 s end-to-end
      //   lag at the cost of frequent re-syncs on network blips —
      //   acceptable because the operator is actively piloting and
      //   wants snappy feedback on WASD/mouselook input.
      const hlsCfg = lowLatency
        ? {
            lowLatencyMode: true,
            backBufferLength: 2,
            maxBufferLength: 2,
            maxMaxBufferLength: 4,
            liveSyncDuration: 0.6,
            liveMaxLatencyDuration: 3,
            manifestLoadingMaxRetry: 8,
            manifestLoadingRetryDelay: 800,
            levelLoadingMaxRetry: 6,
            fragLoadingMaxRetry: 6,
            nudgeMaxRetry: 20,
            nudgeOffset: 0.05,
            enableWorker: true,
            progressive: true,
            maxLiveSyncPlaybackRate: 1.5,
          }
        : {
            lowLatencyMode: true,
            backBufferLength: 10,
            maxBufferLength: 10,
            maxMaxBufferLength: 15,
            liveSyncDuration: 4,
            liveMaxLatencyDuration: 12,
            manifestLoadingMaxRetry: 8,
            manifestLoadingRetryDelay: 1500,
            levelLoadingMaxRetry: 6,
            fragLoadingMaxRetry: 6,
            nudgeMaxRetry: 10,
            nudgeOffset: 0.1,
            enableWorker: true,
            progressive: true,
          };
      const hls = new Hls(hlsCfg);
      hlsRef.current = hls;
      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        window.clearTimeout(offlineTimer);
        setState("playing");
        void video.play().catch(() => {
          // Autoplay can fail; user gesture will retry via muted state.
        });
      });
      hls.on(Hls.Events.LEVEL_UPDATED, () => {
        // Estimate latency from the live edge.
        try {
          const live = hls.liveSyncPosition;
          if (live != null && video.currentTime > 0) {
            setLatencyMs(Math.max(0, Math.round((live - video.currentTime) * 1000)));
          }
        } catch {
          /* ignore */
        }
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            setState("stalled");
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            setState("stalled");
            break;
          default:
            hls.destroy();
            setState("offline");
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari, iOS).
      video.src = STREAM_URL;
      video.addEventListener("loadedmetadata", () => {
        window.clearTimeout(offlineTimer);
        setState("playing");
        void video.play().catch(() => {});
      });
      video.addEventListener("error", () => setState("offline"));
    } else {
      setState("offline");
    }

    return () => {
      window.clearTimeout(offlineTimer);
      teardown();
    };

    function teardown() {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {
          /* ignore */
        }
        hlsRef.current = null;
      }
      if (video) {
        video.removeAttribute("src");
        try {
          video.load();
        } catch {
          /* ignore */
        }
      }
    }
  }, [active, lowLatency]);

  // -------- render --------
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl">
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 h-full w-full bg-black",
          state !== "playing" && "opacity-30",
        )}
        playsInline
        muted={muted}
        controls={false}
      />

      {/* HUD overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-void/80 to-transparent px-3 py-2 text-[10px] uppercase tracking-widest">
        <div className="flex items-center gap-1.5">
          <Radio
            className={cn(
              "h-3 w-3",
              state === "playing"
                ? "animate-pulse-slow text-ember"
                : "text-smoke",
            )}
          />
          <span
            className={cn(
              "font-mono font-semibold",
              state === "playing" && "text-ember",
              state === "offline" && "text-smoke",
              state === "stalled" && "text-flame",
              state === "loading" && "text-cyan",
            )}
          >
            {state === "playing" && "LIVE"}
            {state === "loading" && "Cold start…"}
            {state === "stalled" && "Buffering"}
            {state === "offline" && "Offline"}
            {state === "idle" && "Off"}
          </span>
          {state === "playing" && latencyMs != null && (
            <span className="font-mono text-smoke">
              {(latencyMs / 1000).toFixed(1)}s lag
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="pointer-events-auto inline-flex h-6 items-center gap-1 rounded-md border border-border bg-card/80 px-2 text-smoke transition-colors hover:border-cyan/40 hover:text-bone"
          aria-label={muted ? "Включить звук" : "Mute"}
        >
          {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        </button>
      </div>

      {/* States */}
      {state === "idle" && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/60">
          <div className="text-center text-xs text-smoke">
            Live-stream выключен.
          </div>
        </div>
      )}
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/70">
          <div className="flex items-center gap-2 text-xs text-cyan">
            <Loader2 className="h-4 w-4 animate-spin" />
            Запускаем spectator…
          </div>
        </div>
      )}
      {state === "offline" && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/70">
          <div className="flex max-w-sm flex-col items-center gap-2 text-center text-xs text-smoke">
            <AlertTriangle className="h-5 w-5 text-flame" />
            <span>
              Spectator-pipeline пока не активен. Это нормально — Phase S1
              (MediaMTX scaffolding) задеплоен, но Phase S3 (headless CS 1.6
              client) ещё в разработке. Полное видео появится после следующих
              захватов.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
