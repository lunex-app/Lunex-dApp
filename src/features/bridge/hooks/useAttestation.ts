import { useState, useEffect, useCallback, useRef } from "react";
import { IRIS_API_URL } from "../config/bridgeConfig";

interface AttestationResult {
  attestation: string | null;
  status: "pending" | "complete" | "error";
  error: string | null;
}

export function useAttestation(messageHash: string | null | undefined) {
  const [result, setResult] = useState<AttestationResult>({
    attestation: null,
    status: "pending",
    error: null,
  });
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const poll = useCallback(async () => {
    if (!messageHash) return;

    try {
      const res = await fetch(`${IRIS_API_URL}/${messageHash}`);
      if (!res.ok) {
        if (res.status === 404) {
          // Not ready yet, keep polling
          attemptRef.current += 1;
          const delay = Math.min(5000 * Math.pow(1.5, Math.min(attemptRef.current, 8)), 60000);
          timerRef.current = setTimeout(poll, delay);
          return;
        }
        throw new Error(`Attestation API error: ${res.status}`);
      }

      const data = await res.json();
      if (data.status === "complete" && data.attestation) {
        setResult({ attestation: data.attestation, status: "complete", error: null });
      } else {
        attemptRef.current += 1;
        const delay = Math.min(5000 * Math.pow(1.5, Math.min(attemptRef.current, 8)), 60000);
        timerRef.current = setTimeout(poll, delay);
      }
    } catch (err: any) {
      setResult({ attestation: null, status: "error", error: err.message });
    }
  }, [messageHash]);

  useEffect(() => {
    if (!messageHash) return;
    attemptRef.current = 0;
    setResult({ attestation: null, status: "pending", error: null });
    poll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [messageHash, poll]);

  const retry = useCallback(() => {
    if (!messageHash) return;
    attemptRef.current = 0;
    setResult({ attestation: null, status: "pending", error: null });
    poll();
  }, [messageHash, poll]);

  return { ...result, retry };
}
