"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureRecognizer, GestureRecognizerResult } from "@mediapipe/tasks-vision";

export type TrackerStatus = "idle" | "loading-model" | "starting-camera" | "running" | "error";

const WASM_PATH = "/mediapipe/wasm";
const LOCAL_MODEL = "/models/gesture_recognizer.task";
const REMOTE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

type Delegate = "GPU" | "CPU";

/** Browser ke camera errors ko aise message mein badalta hai jo koi bhi samajh sake. */
function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "NotSupportedError":
    case "SecurityError":
      return "Camera ki permission block hai. Address bar mein 🔒/camera icon par click karke Allow karo, phir page reload karo. Windows par Settings → Privacy → Camera mein browser ko bhi allow hona chahiye.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Is device par koi camera nahi mila. Webcam laga hai aur kisi aur ne disable to nahi kiya, check karo.";
    case "NotReadableError":
    case "AbortError":
      return "Camera kisi aur app mein chal raha hai (Zoom, Teams, Meet, doosra tab). Use band karke dobara try karo.";
  }
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return `Camera nahi khula (${detail}). Camera permission aur doosri apps check karke page reload karo.`;
}


/**
 * Camera kholta hai, MediaPipe GestureRecognizer load karta hai, aur har video frame par
 * `onResult` call karta hai. Haath ka skeleton canvas par khud draw karta hai.
 */
export function useHandTracker(onResult: (result: GestureRecognizerResult, now: number) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const delegateRef = useRef<Delegate | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<Delegate | null>(null);

  const loadRecognizer = useCallback(async (cpuOnly = false) => {
    if (recognizerRef.current && !cpuOnly) return recognizerRef.current;
    const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    const attempts: { model: string; delegate: Delegate }[] = [
      ...(cpuOnly ? [] : [{ model: LOCAL_MODEL, delegate: "GPU" as const }]),
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
        delegateRef.current = delegate;
        setDelegate(delegate);
        return recognizerRef.current;
      } catch (err) {
        lastErr = err;
        console.warn(`[tracker] ${delegate} + ${model} fail hua, agla try kar raha hoon`, err);
      }
    }
    throw new Error(
      `Hand-tracking model load nahi hua. Internet check karo aur page reload karo. (${lastErr instanceof Error ? lastErr.message : lastErr})`,
    );
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
      if (!window.isSecureContext) {
        throw new Error(
          `Browser camera sirf https:// wale link par kholta hai. Abhi link "${location.origin}" hai. Vercel wala https:// link use karo.`,
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Is browser mein camera support nahi hai. Chrome, Edge ya Safari ka naya version use karo.");
      }

      // Pehle camera, taaki permission ka popup turant aaye; model saath mein load hota rahe.
      setStatus("starting-camera");
      const modelPromise = loadRecognizer();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        modelPromise.catch(() => undefined);
        throw new Error(cameraErrorMessage(err));
      }
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      setStatus("loading-model");
      let recognizer = await modelPromise;
      setStatus("running");

      const { DrawingUtils, GestureRecognizer } = await import("@mediapipe/tasks-vision");
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const drawer = new DrawingUtils(ctx);

      let lastVideoTime = -1;
      let switching = false;

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        if (switching) return;
        const now = performance.now();
        let result: GestureRecognizerResult;
        try {
          result = recognizer.recognizeForVideo(video, now);
        } catch (err) {
          // Kuch laptops par GPU mode beech mein fail hota hai; tab chupchaap CPU par shift karo.
          if (delegateRef.current === "CPU") {
            cancelAnimationFrame(rafRef.current);
            setError(`Hand tracking ruk gaya: ${err instanceof Error ? err.message : err}. Page reload karo.`);
            setStatus("error");
            return;
          }
          console.warn("[tracker] GPU fail hua, CPU par shift kar raha hoon", err);
          switching = true;
          loadRecognizer(true)
            .then((r) => {
              recognizer = r;
              switching = false;
            })
            .catch((e) => {
              cancelAnimationFrame(rafRef.current);
              setError(e instanceof Error ? e.message : String(e));
              setStatus("error");
            });
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const hand of result.landmarks) {
          drawer.drawConnectors(hand, GestureRecognizer.HAND_CONNECTIONS, {
            color: "rgba(255,255,255,0.85)",
            lineWidth: 2,
          });
          drawer.drawLandmarks(hand, { color: "rgba(255,255,255,0.95)", fillColor: "#fff", lineWidth: 0, radius: 2.5 });
        }

        onResultRef.current(result, now);
      };
      loop();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
      stop();
      setStatus("error");
    }
  }, [loadRecognizer, stop]);

  useEffect(() => stop, [stop]);

  return { videoRef, canvasRef, status, error, delegate, start, stop };
}
