import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./TaxAssessmentQuestionnaire.module.css";

const getPoint = (event, canvas) => {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event.changedTouches?.[0] || event;
  return {
    x: source.clientX - rect.left,
    y: source.clientY - rect.top,
  };
};

const SignatureCanvas = ({ canvasRef, onDraw }) => {
  const drawing = useRef(false);
  const lastPoint = useRef(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (!width || !height) return;

    const snapshot = canvas.toDataURL();
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 2.6;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (snapshot && snapshot.length > 100) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, width, height);
      image.src = snapshot;
    }
  }, [canvasRef]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(resizeCanvas);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  const startDraw = (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    lastPoint.current = getPoint(event, canvas);
  };

  const moveDraw = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const next = getPoint(event, canvas);
    const prev = lastPoint.current || next;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastPoint.current = next;
    onDraw?.();
  };

  const endDraw = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    drawing.current = false;
    lastPoint.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className={styles.signatureCanvas}
      onMouseDown={startDraw}
      onMouseMove={moveDraw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchStart={startDraw}
      onTouchMove={moveDraw}
      onTouchEnd={endDraw}
    />
  );
};

const SignaturePad = ({ value, onChange, error }) => {
  const [open, setOpen] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef(null);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    setHasInk(false);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;

    const exportCanvas = document.createElement("canvas");
    const maxWidth = 900;
    const ratio = canvas.offsetWidth ? maxWidth / canvas.offsetWidth : 1;
    exportCanvas.width = Math.round(canvas.offsetWidth * ratio);
    exportCanvas.height = Math.round(canvas.offsetHeight * ratio);
    const ctx = exportCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
    onChange(exportCanvas.toDataURL("image/png", 0.8));
    setOpen(false);
  };

  const clearSaved = (event) => {
    event.stopPropagation();
    onChange("");
  };

  useEffect(() => {
    if (!open) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <div className={styles.signatureGroup}>
      <div className={styles.signatureHeader}>
        <label>
          Signature <span className={styles.required}>*</span>
        </label>
        {value ? (
          <button type="button" className={styles.signatureClearBtn} onClick={clearSaved}>
            Clear
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className={styles.signaturePreview}
        onClick={() => {
          setHasInk(false);
          setOpen(true);
        }}
        aria-label="Open signature pad"
      >
        {value ? (
          <img src={value} alt="Drawn signature" />
        ) : (
          <span>Click to draw your signature</span>
        )}
      </button>
      {error}

      {open ? (
        <div className={styles.signatureOverlay} role="dialog" aria-modal="true" aria-label="Draw signature">
          <div className={styles.signatureModal}>
            <div className={styles.signatureModalHeader}>
              <div>
                <h3>Draw your signature</h3>
                <p>Use your mouse or finger. Sign in the large box below.</p>
              </div>
              <button type="button" className={styles.signatureClose} onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className={styles.signatureCanvasWrap}>
              <SignatureCanvas key={open ? "open" : "closed"} canvasRef={canvasRef} onDraw={() => setHasInk(true)} />
            </div>

            <div className={styles.signatureModalActions}>
              <button type="button" className={styles.signatureGhostBtn} onClick={clearCanvas}>
                Clear
              </button>
              <button type="button" className={styles.signatureGhostBtn} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.signatureSaveBtn}
                onClick={saveSignature}
                disabled={!hasInk}
              >
                Save signature
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SignaturePad;
