"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureRecognizer, GestureRecognizerResult } from "@mediapipe/tasks-vision";

export type TrackerStatus = "idle" | "loading-model" | "starting-camera" | "running" | "error";

const WASM_PATH = "/mediapipe/wasm";
const LOCAL_MODEL = "/models/gesture_recognizer.task";
const REMOTE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

const HAND_COLORS = ["#ffb347", "#5eead4"];

/**
 * Camera kholta hai, MediaPipe GestureRecognizer load karta hai, aur har video frame par
 * `onResult` call karta hai. Haath ka skeleton canvas par khud draw karta hai.
 */
export function useHandTracker(onResult: (result: GestureRecognizerResult, now: number) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  const loadRecognizer = useCallback(async () => {
    if (recognizerRef.current) return recognizerRef.current;
    const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    const attempts: { model: string; delegate: "GPU" | "CPU" }[] = [
      { model: LOCAL_MODEL, delegate: "GPU" },
      { model: LOCAL_MODEL, delegate: "CPU" },
      { model: REMOTE_MODEL, delegate: "CPU" },
    ];
    let lastErr: unknown;
    for (const { model, delegate } of attempts) {
      try {
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        return recognizerRef.current;
      } catch (err) {
        lastErr = err;
        console.warn(`[tracker] ${delegate} + ${model} fail hua, agla try kar raha hoon`, err);
      }
    }
    throw lastErr;
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      setStatus("loading-model");
      const recognizer = await loadRecognizer();

      setStatus("starting-camera");
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Is browser mein camera support nahi hai (HTTPS ya localhost zaroori hai).");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setStatus("running");

      const { DrawingUtils, GestureRecognizer } = await import("@mediapipe/tasks-vision");
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const drawer = new DrawingUtils(ctx);

      let lastVideoTime = -1;
      let frames = 0;
      let fpsSince = performance.now();

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const now = performance.now();
        const result = recognizer.recognizeForVideo(video, now);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        result.landmarks.forEach((hand, i) => {
          const color = HAND_COLORS[i % HAND_COLORS.length];
          drawer.drawConnectors(hand, GestureRecognizer.HAND_CONNECTIONS, { color, lineWidth: 4 });
          drawer.drawLandmarks(hand, { color: "#fff", fillColor: color, lineWidth: 1, radius: 3 });
        });

        onResultRef.current(result, now);

        frames++;
        if (now - fpsSince > 1000) {
          setFps(Math.round((frames * 1000) / (now - fpsSince)));
          frames = 0;
          fpsSince = now;
        }
      };
      loop();
    } catch (err) {
      console.error(err);
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera ki permission nahi mili. Browser ke address bar se camera allow karo."
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
      stop();
      setStatus("error");
    }
  }, [loadRecognizer, stop]);

  /** Current frame ki mirrored JPEG (Gemini verify ke liye). */
  const captureFrame = useCallback((maxWidth = 512) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(video.videoWidth * scale);
    c.height = Math.round(video.videoHeight * scale);
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.75);
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, canvasRef, status, error, fps, start, stop, captureFrame };
}
