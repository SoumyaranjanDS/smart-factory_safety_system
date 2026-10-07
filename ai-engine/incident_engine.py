import cv2
import base64
import json
import threading
import argparse
import asyncio
import numpy as np
import socketio
from pathlib import Path
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

# ── Global model references (loaded once) ─────────────────────────────────────
person_tracker = None
ppe_model = None
fire_model = None
fire_names = None
ppe_names = None
models_ready = False

# History for temporal validation (per worker across frames)
worker_history = {}
fire_consecutive_frames = 0

# ── Socket.io Client ───────────────────────────────────────────────────────────
sio = socketio.AsyncClient(logger=False, engineio_logger=False)


def load_models():
    global person_tracker, ppe_model, fire_model, fire_names, ppe_names, models_ready

    print("[Engine] Loading YOLO models...")
    person_tracker = YOLO("yolov8n.pt")

    if not (MODELS_DIR / "ppe_model.pt").exists():
        print("ERROR: ppe_model.pt not found in models/")
        return False
    if not (MODELS_DIR / "fire_model_indoor.pt").exists():
        print("ERROR: fire_model_indoor.pt not found in models/")
        return False

    ppe_model = YOLO(str(MODELS_DIR / "ppe_model.pt"))
    fire_model = YOLO(str(MODELS_DIR / "fire_model_indoor.pt"))
    fire_names = fire_model.names
    ppe_names = ppe_model.names
    models_ready = True
    print("[Engine] Models loaded successfully!")
    return True


def process_frame(jpeg_bytes):
    """Run full detection pipeline on a JPEG frame. Returns (annotated_jpeg_bytes, state_dict)."""
    global worker_history, fire_consecutive_frames

    nparr = np.frombuffer(jpeg_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return None, {"workers": {}, "incidents": []}

    current_state = {"workers": {}, "incidents": []}

    # ── Stage 1: Track People ──────────────────────────────────────────────────
    track_results = person_tracker.track(
        frame, classes=[0], persist=True, verbose=False
    )
    person_boxes = []

    if track_results[0].boxes.id is not None:
        boxes = track_results[0].boxes.xyxy.cpu().numpy()
        ids = track_results[0].boxes.id.cpu().numpy()

        for box, track_id in zip(boxes, ids):
            x1, y1, x2, y2 = map(int, box)
            worker_id = f"Worker_{int(track_id)}"
            person_boxes.append((worker_id, (x1, y1, x2, y2)))
            current_state["workers"][worker_id] = {
                "bbox": [x1, y1, x2, y2],
                "helmet": "MISSING",
                "vest": "MISSING",
                "gloves": "MISSING",
                "boots": "MISSING",
            }
            if y1 < 10:
                current_state["workers"][worker_id]["helmet"] = "OCCLUDED"

            cv2.rectangle(frame, (x1, y1), (x2, y2), (220, 220, 220), 2)
            cv2.putText(
                frame,
                worker_id,
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (220, 220, 220),
                2,
            )

    # ── Stage 2: Detect PPE ────────────────────────────────────────────────────
    ppe_results = ppe_model(frame, verbose=False)
    for box in ppe_results[0].boxes:
        px1, py1, px2, py2 = map(int, box.xyxy[0])
        cls_id = int(box.cls[0])
        label = ppe_names[cls_id]
        conf = float(box.conf[0])
        if conf < 0.5:
            continue

        cx = (px1 + px2) / 2
        cy = (py1 + py2) / 2
        owner_id = None
        for w_id, (wx1, wy1, wx2, wy2) in person_boxes:
            if wx1 <= cx <= wx2 and wy1 <= cy <= wy2:
                owner_id = w_id
                break

        if owner_id:
            if label == "Helmet":
                current_state["workers"][owner_id]["helmet"] = "COMPLIANT"
            elif label == "Vest":
                current_state["workers"][owner_id]["vest"] = "COMPLIANT"
            elif label == "Glove":
                current_state["workers"][owner_id]["gloves"] = "COMPLIANT"
            elif label == "Boots":
                current_state["workers"][owner_id]["boots"] = "COMPLIANT"

        cv2.rectangle(frame, (px1, py1), (px2, py2), (0, 200, 80), 2)
        cv2.putText(
            frame,
            f"{label} {conf:.2f}",
            (px1, py1 - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 200, 80),
            1,
        )

    # ── Stage 3: Detect Fire & Smoke ───────────────────────────────────────────
    fire_results = fire_model(frame, verbose=False)
    fire_detected_this_frame = False

    for box in fire_results[0].boxes:
        fx1, fy1, fx2, fy2 = map(int, box.xyxy[0])
        cls_id = int(box.cls[0])
        label = fire_names[cls_id]
        conf = float(box.conf[0])
        if conf < 0.45:
            continue

        color = (0, 60, 255) if label.lower() == "fire" else (130, 130, 130)
        cv2.rectangle(frame, (fx1, fy1), (fx2, fy2), color, 2)
        cv2.putText(
            frame,
            f"{label.upper()} {conf:.2f}",
            (fx1, fy1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            color,
            2,
        )

        if label.lower() == "fire":
            fire_detected_this_frame = True

    # ── Stage 4: Temporal Validation ───────────────────────────────────────────
    fire_consecutive_frames = (
        fire_consecutive_frames + 1
        if fire_detected_this_frame
        else max(0, fire_consecutive_frames - 1)
    )

    if fire_consecutive_frames >= 10:
        current_state["incidents"].append(
            {
                "type": "CRITICAL",
                "message": "Confirmed Fire Detected",
            }
        )
        cv2.putText(
            frame,
            "CRITICAL: FIRE DETECTED",
            (30, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.1,
            (0, 0, 255),
            3,
        )

    for w_id, state in current_state["workers"].items():
        if w_id not in worker_history:
            worker_history[w_id] = {
                "missing_helmet": 0,
                "missing_vest": 0,
                "missing_gloves": 0,
                "missing_boots": 0,
            }

        h = worker_history[w_id]
        h["missing_helmet"] = (
            h["missing_helmet"] + 1 if state["helmet"] == "MISSING" else 0
        )
        h["missing_vest"] = h["missing_vest"] + 1 if state["vest"] == "MISSING" else 0
        h["missing_gloves"] = (
            h["missing_gloves"] + 1 if state["gloves"] == "MISSING" else 0
        )
        h["missing_boots"] = (
            h["missing_boots"] + 1 if state["boots"] == "MISSING" else 0
        )

        wx1, wy1, wx2, wy2 = state["bbox"]

        if h["missing_helmet"] >= 15:
            current_state["incidents"].append(
                {
                    "type": "WARNING",
                    "message": f"{w_id}: Missing Helmet",
                    "worker_id": w_id,
                }
            )
            cv2.rectangle(frame, (wx1, wy1), (wx2, wy2), (0, 0, 220), 3)
            cv2.putText(
                frame,
                "NO HELMET",
                (wx1, wy1 - 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (0, 0, 220),
                2,
            )

        if h["missing_vest"] >= 15:
            current_state["incidents"].append(
                {
                    "type": "WARNING",
                    "message": f"{w_id}: Missing Safety Vest",
                    "worker_id": w_id,
                }
            )

        if h["missing_gloves"] >= 15:
            current_state["incidents"].append(
                {
                    "type": "WARNING",
                    "message": f"{w_id}: Missing Gloves",
                    "worker_id": w_id,
                }
            )

        if h["missing_boots"] >= 15:
            current_state["incidents"].append(
                {
                    "type": "WARNING",
                    "message": f"{w_id}: Missing Boots",
                    "worker_id": w_id,
                }
            )

    # ── Encode annotated frame back to JPEG ────────────────────────────────────
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return buffer.tobytes(), current_state


# ── Socket.io Events ───────────────────────────────────────────────────────────
@sio.event
async def connect():
    print("[Engine] Connected to Node.js server")
    await sio.emit("register_python")


@sio.event
async def disconnect():
    print("[Engine] Disconnected from Node.js server")


@sio.on("frame")
async def on_frame(data):
    if not models_ready:
        return

    client_id = data.get("clientId")
    frame_data = data.get("frame")

    if isinstance(frame_data, str):
        jpeg_bytes = base64.b64decode(frame_data)
    else:
        jpeg_bytes = bytes(frame_data)

    # Run inference in a thread so we don't block the event loop
    loop = asyncio.get_event_loop()
    annotated_bytes, state = await loop.run_in_executor(None, process_frame, jpeg_bytes)

    if annotated_bytes is None:
        return

    annotated_b64 = base64.b64encode(annotated_bytes).decode("utf-8")

    await sio.emit(
        "processed_frame",
        {
            "clientId": client_id,
            "frame": annotated_b64,
            "workers": state["workers"],
            "incidents": state["incidents"],
        },
    )


async def main():
    if not load_models():
        return

    print("[Engine] Connecting to Node.js signaling server...")
    while True:
        try:
            await sio.connect("http://localhost:4000")
            await sio.wait()
        except Exception as e:
            print(f"[Engine] Connection failed: {e}. Retrying in 3s...")
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(main())
