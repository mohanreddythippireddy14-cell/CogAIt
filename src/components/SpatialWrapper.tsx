import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";

/**
 * SpatialWrapper — wraps the entire authenticated app content.
 * Double-click empty space → toggles between flat 2D and immersive 3D floating mode.
 *
 * In 3D mode the page content floats as a glassmorphic panel over a
 * deep-space starfield with mouse parallax, particles, and a floating orb.
 */
export function SpatialWrapper({ children }: { children: ReactNode }) {
  const [is3D, setIs3D] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "entering3d" | "exiting3d">("idle");
  const [hintVisible, setHintVisible] = useState(true);

  const starRef = useRef<HTMLCanvasElement>(null);
  const partRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const tgtRot = useRef({ x: 0, y: 0 });
  const curRot = useRef({ x: 0, y: 0 });
  const starsData = useRef<{ x: number; y: number; sz: number; sp: number; ph: number }[]>([]);
  const partsData = useRef<{ x: number; y: number; sz: number; sp: number; c: string; a: number }[]>([]);
  const is3DRef = useRef(false);
  const t0 = useRef(Date.now());

  useEffect(() => { is3DRef.current = is3D; }, [is3D]);

  // Auto-hide hint after 6s
  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  // Toggle body class for background transition
  useEffect(() => {
    if (is3D) {
      document.body.classList.add("spatial-mode-active");
    } else {
      document.body.classList.remove("spatial-mode-active");
    }
    return () => document.body.classList.remove("spatial-mode-active");
  }, [is3D]);

  // Init canvas
  const initCanvas = useCallback(() => {
    const w = window.innerWidth, h = window.innerHeight;
    if (starRef.current) { starRef.current.width = w; starRef.current.height = h; }
    if (partRef.current) { partRef.current.width = w; partRef.current.height = h; }
    starsData.current = Array.from({ length: 200 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      sz: Math.random() * 1.5, sp: 0.005 + Math.random() * 0.02, ph: Math.random() * 6.28,
    }));
    partsData.current = Array.from({ length: 18 }, () => ({
      x: Math.random() * w, y: h + Math.random() * 200,
      sz: 1 + Math.random() * 2, sp: 0.2 + Math.random() * 0.5,
      c: Math.random() > 0.5 ? "#00D4FF" : "#7C3AED",
      a: 0.1 + Math.random() * 0.5,
    }));
  }, []);

  useEffect(() => {
    initCanvas();
    window.addEventListener("resize", initCanvas);
    return () => window.removeEventListener("resize", initCanvas);
  }, [initCanvas]);

  // Mouse parallax
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!is3DRef.current) return;
      tgtRot.current.y = ((e.clientX / window.innerWidth) * 2 - 1) * 6;
      tgtRot.current.x = -((e.clientY / window.innerHeight) * 2 - 1) * 4;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Render loop
  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const elapsed = Date.now() - t0.current;

      if (is3DRef.current && worldRef.current) {
        curRot.current.x += (tgtRot.current.x - curRot.current.x) * 0.06;
        curRot.current.y += (tgtRot.current.y - curRot.current.y) * 0.06;
        const floatY = Math.sin(elapsed * 0.0008) * 5;
        worldRef.current.style.transform =
          `perspective(1400px) rotateX(${curRot.current.x}deg) rotateY(${curRot.current.y}deg) translateY(${floatY}px)`;
      }

      // Stars
      if (is3DRef.current && starRef.current) {
        const sC = starRef.current.getContext("2d");
        if (sC) {
          const { width: w, height: h } = starRef.current;
          sC.clearRect(0, 0, w, h);
          sC.fillStyle = "#fff";
          const st = Date.now() * 0.001;
          for (const s of starsData.current) {
            sC.globalAlpha = 0.12 + (Math.sin(st * s.sp * 100 + s.ph) + 1) / 2 * 0.88;
            sC.beginPath(); sC.arc(s.x, s.y, s.sz, 0, 6.28); sC.fill();
          }
          sC.globalAlpha = 1;
        }
      }

      // Particles
      if (is3DRef.current && partRef.current) {
        const pC = partRef.current.getContext("2d");
        if (pC) {
          const { width: w, height: h } = partRef.current;
          pC.clearRect(0, 0, w, h);
          for (const p of partsData.current) {
            p.y -= p.sp;
            if (p.y < -50) p.y = h + 50;
            pC.fillStyle = p.c; pC.globalAlpha = p.a;
            pC.beginPath(); pC.arc(p.x, p.y, p.sz, 0, 6.28); pC.fill();
          }
          pC.globalAlpha = 1;
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(animRef.current); };
  }, []);

  // Double-click handler
  const handleDblClick = useCallback((e: React.MouseEvent) => {
    const tgt = e.target as HTMLElement;
    if (
      tgt.closest("button") || tgt.closest("a") || tgt.closest("input") ||
      tgt.closest("textarea") || tgt.closest("select") || tgt.closest("[role='button']") ||
      tgt.closest("[contenteditable]") ||
      tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "BUTTON" || tgt.tagName === "A"
    ) return;
    if (transitioning) return;
    setTransitioning(true);
    setHintVisible(false);

    if (!is3D) {
      // 2D → 3D
      setPhase("entering3d");
      setTimeout(() => {
        setIs3D(true);
        setTimeout(() => { setPhase("idle"); setTransitioning(false); }, 800);
      }, 50);
    } else {
      // 3D → 2D
      setPhase("exiting3d");
      setTimeout(() => {
        setIs3D(false);
        tgtRot.current = { x: 0, y: 0 };
        curRot.current = { x: 0, y: 0 };
        if (worldRef.current) worldRef.current.style.transform = "";
        setTimeout(() => { setPhase("idle"); setTransitioning(false); }, 500);
      }, 400);
    }
  }, [is3D, transitioning]);

  return (
    <div onDoubleClick={handleDblClick} style={{ position: "relative", minHeight: "100vh" }}>
      {/* ── Space backdrop ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        opacity: is3D ? 1 : 0,
        transition: "opacity 0.5s ease",
        pointerEvents: "none",
      }}>
        <canvas ref={starRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <div style={{
          position: "absolute", inset: 0,
          background: [
            "radial-gradient(circle at 10% 50%, rgba(124,58,237,0.18) 0%, transparent 40%)",
            "radial-gradient(circle at 90% 10%, rgba(0,212,255,0.18) 0%, transparent 40%)",
            "radial-gradient(circle at 50% 90%, rgba(255,107,157,0.14) 0%, transparent 40%)",
          ].join(","),
        }} />
        <canvas ref={partRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "repeating-linear-gradient(to bottom, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at center, transparent 40%, rgba(1,3,8,0.8) 100%)",
        }} />
      </div>

      {/* ── Content in a parallax world container ── */}
      <div
        ref={worldRef}
        style={{
          position: "relative", zIndex: 10, minHeight: "100vh",
          transformStyle: is3D ? "preserve-3d" as const : "flat" as const,
          transition: phase === "idle" && is3D ? "transform 0.08s linear" : undefined,
        }}
      >
        <div className={[
          "spatial-content-panel",
          is3D ? "spatial-panel-floating" : "",
          phase === "entering3d" ? "spatial-panel-enter" : "",
          phase === "exiting3d" ? "spatial-panel-exit" : "",
        ].filter(Boolean).join(" ")}>
          {children}
        </div>
      </div>

      {/* ── Floating orb ── */}
      {is3D && (
        <div style={{
          position: "fixed", top: "14%", right: "6%", zIndex: 5,
          width: 48, height: 48, borderRadius: "50%",
          background: "radial-gradient(circle at 33% 28%, #fff 0%, #00D4FF 30%, #2e0854 70%, #010308 100%)",
          boxShadow: "0 0 20px rgba(0,212,255,0.35), 0 0 40px rgba(124,58,237,0.25)",
          animation: "spatial-orb-float 5s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}

      {/* ── Bottom label ── */}
      {is3D && (
        <div style={{
          position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)",
          fontFamily: "monospace", fontSize: 8, letterSpacing: 2.5,
          color: "rgba(255,255,255,0.14)", zIndex: 60, pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 10,
          animation: "spatial-label-in 1s ease 0.5s both",
        }}>
          <span style={{ width: 20, height: 1, background: "rgba(255,255,255,0.1)", display: "inline-block" }} />
          CogAIt · Spatial Mode · v0.1
          <span style={{ width: 20, height: 1, background: "rgba(255,255,255,0.1)", display: "inline-block" }} />
        </div>
      )}

      {/* ── Hint (first load only) ── */}
      {!is3D && hintVisible && phase === "idle" && (
        <div className="spatial-hint-indicator">
          double-click empty space to enter spatial mode →
        </div>
      )}
    </div>
  );
}
