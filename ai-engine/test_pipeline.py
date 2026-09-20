"""
BPUT-FSTS Detection Pipeline — Test Script
-------------------------------------------
Tests fire/smoke and PPE detection on a video file or webcam.
Run with fire model only for now; PPE model plugs in when ready.

Usage:
  python test_pipeline.py                        # webcam
  python test_pipeline.py --source video.mp4     # video file
  python test_pipeline.py --source video.mp4 --save  # save output
"""

import argparse
import time
from pathlib import Path
import cv2
import torch
from ultralytics import YOLO

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_DIR       = Path(__file__).parent.parent
MODELS_DIR     = BASE_DIR / "ai-engine" / "models"
EVIDENCE_DIR   = BASE_DIR / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

FIRE_MODEL_PATH = MODELS_DIR / "fire_model_indoor.pt"
PPE_MODEL_PATH  = MODELS_DIR / "ppe_model.pt"     # not needed yet

# Detection thresholds
FIRE_CONF    = 0.45   # confidence threshold for fire/smoke
PPE_CONF     = 0.45   # confidence threshold for PPE

# PPE classes we care about (from factory-2)
# 0=Boots, 1=Gloves, 2=Mask, 3=Safety-Helmet, 4=Safety-Vest, 5=Safety-Wearpack
REQUIRED_PPE = {3: "Safety-Helmet", 4: "Safety-Vest"}   # minimum required PPE
ALL_PPE      = {0: "Boots", 1: "Gloves", 2: "Mask",
                3: "Safety-Helmet", 4: "Safety-Vest", 5: "Safety-Wearpack"}

# Display colors (BGR)
COLOR_FIRE   = (0, 0, 255)      # red
COLOR_SMOKE  = (128, 128, 128)  # grey
COLOR_PPE    = (0, 255, 0)      # green
COLOR_PERSON = (255, 165, 0)    # orange
COLOR_ALERT  = (0, 0, 255)      # red for alerts

TARGET_FPS   = 15               # 15fps — CCTV standard


def draw_box(frame, x1, y1, x2, y2, label, color, conf=None):
    """Draw a bounding box with label on frame."""
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    text = f"{label} {conf:.2f}" if conf is not None else label
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
    cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
    cv2.putText(frame, text, (x1 + 2, y1 - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)


def draw_hud(frame, fps, fire_active, ppe_active, alerts):
    """Draw heads-up display with system status."""
    h, w = frame.shape[:2]

    # Background panel
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (320, 120), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    # Status text
    cv2.putText(frame, f"BPUT-FSTS v1.0", (10, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
    cv2.putText(frame, f"FPS: {fps:.1f}", (10, 44),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (150, 255, 150), 1)

    fire_status = ("ACTIVE", COLOR_FIRE) if fire_active else ("OK", (0, 200, 0))
    cv2.putText(frame, f"Fire/Smoke: {fire_status[0]}", (10, 66),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, fire_status[1], 1)

    ppe_label = "LOADED" if ppe_active else "PENDING (training)"
    ppe_color = (0, 200, 0) if ppe_active else (100, 100, 255)
    cv2.putText(frame, f"PPE:        {ppe_label}", (10, 88),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, ppe_color, 1)

    # Alerts at bottom
    if alerts:
        for i, alert in enumerate(alerts[-3:]):   # show last 3 alerts
            cv2.putText(frame, f"⚠ {alert}", (10, h - 40 + i * 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_ALERT, 1)


def run_pipeline(source, save_output=False):
    # ── Load models ───────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  BPUT-FSTS Detection Pipeline")
    print("=" * 60)

    if not FIRE_MODEL_PATH.exists():
        print(f"ERROR: fire_model.pt not found at {FIRE_MODEL_PATH}")
        print("Run train_fire.py first.")
        return

    print(f"\nLoading fire model: {FIRE_MODEL_PATH.name}")
    fire_model = YOLO(str(FIRE_MODEL_PATH))
    # D-Fire dataset has inverted labels: class 0 detects large smoky areas,
    # class 1 detects actual flame sources. Swap to match visual reality.
    # fire_class_names = {0: 'smoke', 1: 'fire'}
    fire_class_names = fire_model.names

    ppe_model = None
    if PPE_MODEL_PATH.exists():
        print(f"Loading PPE model:  {PPE_MODEL_PATH.name}")
        ppe_model = YOLO(str(PPE_MODEL_PATH))
    else:
        print(f"PPE model not found — running fire detection only")
        print(f"  (place ppe_model.pt in {MODELS_DIR} when Colab training is done)")

    device = "0" if torch.cuda.is_available() else "cpu"
    print(f"\nDevice: {'GPU (RTX 3050)' if device == '0' else 'CPU'}")

    # ── Open video/webcam ────────────────────────────────────────────────────
    src = 0 if source == "0" else source
    cap = cv2.VideoCapture(src)

    if not cap.isOpened():
        print(f"ERROR: Cannot open source: {source}")
        return

    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps_video = cap.get(cv2.CAP_PROP_FPS)
    if fps_video == 0 or fps_video != fps_video:
        fps_video = 30.0
    print(f"Source: {source} ({frame_w}×{frame_h} @ {fps_video}fps)")

    # ── Output writer ─────────────────────────────────────────────────────────
    writer = None
    if save_output:
        out_path = EVIDENCE_DIR / f"pipeline_test_{int(time.time())}.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"XVID")
        writer = cv2.VideoWriter(str(out_path), fourcc, fps_video, (frame_w, frame_h))
        print(f"Saving output to: {out_path}")

    # ── Frame timing ──────────────────────────────────────────────────────────
    # fps_video is already calculated above
    wait_ms = int(1000 / fps_video) if str(source) != "0" else 1

    prev_time = time.time()
    fps_display = 0.0
    frame_count = 0
    alerts = []

    print(f"\nPlaying video at natural speed (~{fps_video} FPS). Press Q to quit.\n")

    # Create a resizable window
    cv2.namedWindow("BPUT-FSTS Safety Monitor", cv2.WINDOW_NORMAL)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        now = time.time()
        elapsed = now - prev_time
        if elapsed > 0:
            fps_display = 1.0 / elapsed
        prev_time = now
        frame_count += 1

        fire_active = False
        frame_alerts = []

        # ── Fire/Smoke Detection ──────────────────────────────────────────────
        fire_results = fire_model(frame, conf=FIRE_CONF, device=device, verbose=False)

        for result in fire_results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                conf   = float(box.conf[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                label = fire_class_names.get(cls_id, str(cls_id))
                # cls_id 0 = smoky area (show as smoke), cls_id 1 = flame (show as fire)
                color = COLOR_SMOKE if cls_id == 0 else COLOR_FIRE

                draw_box(frame, x1, y1, x2, y2, label.upper(), color, conf)
                fire_active = True

                alert = f"{label.upper()} DETECTED ({conf:.0%})"
                frame_alerts.append(alert)
                if frame_count % 15 == 0:   # print alert every 15 frames
                    print(f"[ALERT] {alert}")

        # ── PPE Detection (when model is available) ──────────────────────────
        if ppe_model is not None:
            ppe_results = ppe_model(frame, conf=PPE_CONF, device=device, verbose=False)
            detected_ppe_classes = set()

            for result in ppe_results:
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    conf   = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])

                    label = ALL_PPE.get(cls_id, f"cls_{cls_id}")
                    draw_box(frame, x1, y1, x2, y2, label, COLOR_PPE, conf)
                    detected_ppe_classes.add(cls_id)

            # Check for missing required PPE
            for cls_id, name in REQUIRED_PPE.items():
                if cls_id not in detected_ppe_classes:
                    alert = f"NO {name.upper()} DETECTED"
                    frame_alerts.append(alert)
                    if frame_count % 30 == 0:
                        print(f"[PPE ALERT] {alert}")

        # ── Update alert history ──────────────────────────────────────────────
        if frame_alerts:
            alerts.extend(frame_alerts)
            alerts = alerts[-10:]   # keep last 10

        # ── Draw HUD ──────────────────────────────────────────────────────────
        draw_hud(frame, fps_display, fire_active, ppe_model is not None, alerts)

        # ── Show and save ─────────────────────────────────────────────────────
        cv2.imshow("BPUT-FSTS Safety Monitor", frame)
        if writer:
            writer.write(frame)

        if cv2.waitKey(wait_ms) & 0xFF == ord("q"):
            print("\nStopped by user.")
            break

    cap.release()
    if writer:
        writer.release()
        print(f"\nOutput saved to: {out_path}")
    cv2.destroyAllWindows()

    print(f"\nProcessed {frame_count} frames.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BPUT-FSTS Detection Pipeline")
    parser.add_argument("--source", default="0",
                        help="Video source: '0' for webcam, or path to video file")
    parser.add_argument("--save", action="store_true",
                        help="Save output video to evidence/ folder")
    args = parser.parse_args()

    run_pipeline(args.source, save_output=args.save)
