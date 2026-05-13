"use client";

import Hls from "hls.js";
import { AlertTriangle, Loader2, Radio, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Two egress endpoints, both served by MediaMTX behind nginx.
//   /stream/cs1/index.m3u8 — LL-HLS, smooth, ~2-4s latency (casual viewers)
//   /whep/cs1/whep         — WebRTC WHEP, ~200-500ms (pilot mode)
const HLS_URL = "/stream/cs1/index.m3u8";
const WHEP_URL = "/whep/cs1/whep";

// How long we wait before declaring the upstream pipeline dead.
const COLD_START_GRACE_MS = 20_000;

type PlayerState = "idle" | "loading" | "playing" | "stalled" | "offline";

export function StreamPlayer({
  active,
  lowLatency = false,
}: {
  active: boolean;
  /**
   * Pilot mode flag. When true the StreamPlayer connects via WebRTC
   * (WHEP) for ≈200-500ms end-to-end lag — required to fly the
   * spectator with WASD/mouselook. When false uses LL-HLS for a
   * smooth 2-4s casual-viewer experience.
   */
  lowLatency?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [muted, setMuted] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [transport, setTransport] = useState<"hls" | "webrtc">("hls");

  // -------- lifecycle --------
  useEffect(() => {
    if (!active) {
      teardown();
      setState("idle");
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    setState("loading");
    setTransport(lowLatency ? "webrtc" : "hls");
    const offlineTimer = window.setTimeout(() => {
      setState((s) => (s === "loading" ? "offline" : s));
    }, COLD_START_GRACE_MS);

    let cancelled = false;
    let statsInterval: number | null = null;

    if (lowLatency) {
      // -------- WebRTC / WHEP path --------
      void startWebRTC(video).then(
        (pc) => {
          if (cancelled) {
            try { pc.close(); } catch { /* ignore */ }
            return;
          }
          pcRef.current = pc;
          window.clearTimeout(offlineTimer);
          // pc connection state drives our player state.
          pc.addEventListener("connectionstatechange", () => {
            const s = pc.connectionState;
            if (s === "connected") setState("playing");
            else if (s === "connecting" || s === "new") setState("loading");
            else if (s === "disconnected") setState("stalled");
            else if (s === "failed" || s === "closed") setState("offline");
          });
          // Latency estimation via getStats — read every 1s.
          statsInterval = window.setInterval(async () => {
            try {
              const stats = await pc.getStats();
              let jbAvg: number | null = null;
              stats.forEach((r) => {
                if (r.type === "inbound-rtp" && (r as RTCInboundRtpStreamStats & { kind?: string }).kind === "video") {
                  // jitterBufferDelay / jitterBufferEmittedCount is the
                  // average milliseconds a packet spent in the jitter
                  // buffer — the dominant latency contributor for
                  // WebRTC. Multiply by 1000 since the underlying
                  // values are seconds.
                  const rtp = r as RTCInboundRtpStreamStats & {
                    jitterBufferDelay?: number;
                    jitterBufferEmittedCount?: number;
                  };
                  if (rtp.jitterBufferDelay && rtp.jitterBufferEmittedCount) {
                    jbAvg = (rtp.jitterBufferDelay / rtp.jitterBufferEmittedCount) * 1000;
                  }
                }
              });
              if (jbAvg != null) setLatencyMs(Math.round(jbAvg));
            } catch { /* ignore */ }
          }, 1000);
        },
        (err) => {
          if (cancelled) return;
          window.clearTimeout(offlineTimer);
          console.error("WHEP failed", err);
          setState("offline");
        },
      );
    } else if (Hls.isSupported()) {
      // -------- HLS path (smooth casual viewing) --------
      const hls = new Hls({
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
      });
      hlsRef.current = hls;
      hls.loadSource(HLS_URL);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        window.clearTimeout(offlineTimer);
        setState("playing");
        void video.play().catch(() => { /* gesture-blocked autoplay; user toggles mute */ });
      });
      hls.on(Hls.Events.LEVEL_UPDATED, () => {
        try {
          const live = hls.liveSyncPosition;
          if (live != null && video.currentTime > 0) {
            setLatencyMs(Math.max(0, Math.round((live - video.currentTime) * 1000)));
          }
        } catch { /* ignore */ }
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
      video.src = HLS_URL;
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
      cancelled = true;
      window.clearTimeout(offlineTimer);
      if (statsInterval != null) window.clearInterval(statsInterval);
      teardown();
    };

    function teardown() {
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch { /* ignore */ }
        hlsRef.current = null;
      }
      if (pcRef.current) {
        try { pcRef.current.close(); } catch { /* ignore */ }
        pcRef.current = null;
      }
      if (video) {
        try { video.srcObject = null; } catch { /* ignore */ }
        video.removeAttribute("src");
        try { video.load(); } catch { /* ignore */ }
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
        autoPlay
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
          <span className="font-mono text-cyan/70">[{transport.toUpperCase()}]</span>
          {state === "playing" && latencyMs != null && (
            <span className="font-mono text-smoke">
              {latencyMs < 1000
                ? `${latencyMs}ms lag`
                : `${(latencyMs / 1000).toFixed(1)}s lag`}
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
            {transport === "webrtc" ? "WebRTC handshake…" : "Запускаем spectator…"}
          </div>
        </div>
      )}
      {state === "offline" && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/70">
          <div className="flex max-w-sm flex-col items-center gap-2 text-center text-xs text-smoke">
            <AlertTriangle className="h-5 w-5 text-flame" />
            <span>
              Stream offline. Проверь cs-spectator + cs-encoder сервисы
              на VPS, либо отключи Pilot mode для HLS-фолбэка.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebRTC WHEP client
//
// MediaMTX exposes an HTTP endpoint at /whep/<path>/whep that follows the
// WHEP draft (draft-ietf-wish-whep-01). The exchange is one-shot:
//
//   POST /whep/cs1/whep   Content-Type: application/sdp
//   < SDP offer in body
//   ---
//   200 OK   Content-Type: application/sdp
//   < SDP answer in body
//
// Media flows over UDP 8189 directly between viewer and the VPS public IP.
// No trickle ICE — we wait for ICE gathering to complete before POSTing.
// ---------------------------------------------------------------------------
async function startWebRTC(video: HTMLVideoElement): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    bundlePolicy: "max-bundle",
  });

  // We only receive — explicit recvonly transceivers help SDP negotiation
  // since the publisher's tracks come in as ontrack events.
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  pc.addEventListener("track", (e) => {
    if (e.streams[0]) {
      video.srcObject = e.streams[0];
      void video.play().catch(() => { /* autoplay may be blocked */ });
    }
  });

  // Create offer, set local desc, wait for ICE gathering.
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onChange);
    // 3 s safety timeout — proceed even if ICE doesn't finish gathering.
    setTimeout(resolve, 3000);
  });

  const sdp = pc.localDescription?.sdp;
  if (!sdp) throw new Error("no local SDP after gathering");

  const res = await fetch(WHEP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: sdp,
  });
  if (!res.ok) {
    throw new Error(`WHEP POST returned HTTP ${res.status}`);
  }
  const answerSdp = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  return pc;
}
