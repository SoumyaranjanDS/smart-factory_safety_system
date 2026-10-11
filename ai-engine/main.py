import asyncio
import cv2
import numpy as np
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import time
import logging
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Mute the noisy httpx logs
logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration ---
PERSON_MODEL_PATH = "models/person/yolo26n_v2.pt"  # Upgraded custom Gatekeeper model
PPE_MODEL_PATH = "models/ppe/ppe_v3.pt"  # Latest PPE Version
FIRE_MODEL_PATH = (
    "models/fire_smoke/fire_indoor_v2.pt"  # The REAL trained Fire/Smoke model
)

NODE_API_URL = "http://localhost:4000/api/alerts"

# Dictionary to track last alert times to prevent DB flooding
# Format: { camera_id: { alert_signature: timestamp } }
last_alert_times = {}
BATCH_SIZE = 1
MAX_QUEUE_SIZE = 1

# --- Load Models ---
logger.info("Loading YOLO models (Person, PPE, Fire)...")
try:
    person_model = YOLO(PERSON_MODEL_PATH)
    logger.info("Person Tracker (yolov8n.pt) loaded.")
except Exception as e:
    logger.error(f"Failed to load Person model: {e}")
    person_model = None

try:
    ppe_model = YOLO(PPE_MODEL_PATH)
    logger.info("PPE Model loaded.")
except Exception as e:
    logger.error(f"Failed to load PPE model: {e}")
    ppe_model = None

try:
    fire_model = YOLO(FIRE_MODEL_PATH)
    logger.info("Fire Model loaded.")
except Exception as e:
    logger.error(f"Failed to load Fire model: {e}")
    fire_model = None

# Global processing queues and websocket tracker
live_queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
entry_queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
active_websockets = {}  # { camera_id: websocket }
main_loop = None  # Will be set to the asyncio event loop

# --- Premium Color Palette ---
CLASS_COLORS = {
    "Worker": "#ffffff",  # White
    "worker": "#ffffff",  # White (lowercase for .get lookup)
    "helmet": "#eab308",  # Yellow
    "vest": "#3b82f6",  # Blue
    "boots": "#8b5cf6",  # Purple
    "gloves": "#14b8a6",  # Teal
    "glasses": "#ec4899",  # Pink
    "fire": "#f97316",  # Orange
    "smoke": "#94a3b8",  # Slate Gray
    "flame": "#f97316",  # Orange
}


def process_live_batch(batch):
    """
    Live Monitoring Pipeline: Full-frame inference for maximum accuracy and speed.
    Mirrors the test_new_models.py approach — single PPE pass on the whole frame.
    """
    try:
        if not batch:
            return

        frames = [item["frame"] for item in batch]
        camera_ids = [item["camera_id"] for item in batch]

        # --- Sequential 3-Model Architecture ---

        # 1. Fire/Smoke detection (Runs independently on full frame)
        fire_results = (
            [fire_model(f, conf=0.60, verbose=False)[0] for f in frames]
            if fire_model
            else [None] * len(frames)
        )

        # 2. Person detection (Determines if PPE check is needed)
        person_results = (
            [person_model(f, conf=0.60, verbose=False)[0] for f in frames]
            if person_model
            else [None] * len(frames)
        )

        # 3. PPE Model (Runs ONLY if a person is detected)
        ppe_results = [None] * len(frames)
        if ppe_model:
            for idx, res in enumerate(person_results):
                if res and len(res.boxes) > 0:
                    # Person detected, run PPE model
                    # Lowered to 0.25: Since we now use overlap logic, we want the AI to catch blurry or partially visible vests
                    # so it doesn't falsely accuse workers of missing them.
                    ppe_results[idx] = ppe_model(frames[idx], conf=0.25, verbose=False)[
                        0
                    ]

        for i in range(len(frames)):
            cam_id = camera_ids[i]
            frame_h, frame_w = frames[i].shape[:2]
            alerts = []
            # --- Collect Alerts ---
            # Extract PPE Alerts using spatial overlap with Person boxes
            if person_results[i] and len(person_results[i].boxes) > 0:
                for p_box in person_results[i].boxes:
                    px1, py1, px2, py2 = map(int, p_box.xyxy[0])
                    p_conf = float(p_box.conf[0])

                    has_helmet = False
                    has_vest = False

                    if ppe_results[i] and len(ppe_results[i].boxes) > 0:
                        for ppe_box in ppe_results[i].boxes:
                            ppe_x1, ppe_y1, ppe_x2, ppe_y2 = map(int, ppe_box.xyxy[0])
                            cls_id = int(ppe_box.cls[0])
                            class_name = ppe_results[i].names[cls_id].lower()

                            # Check if the PPE box center is inside the person box
                            cx = (ppe_x1 + ppe_x2) / 2
                            cy = (ppe_y1 + ppe_y2) / 2

                            if px1 <= cx <= px2 and py1 <= cy <= py2:
                                if "helmet" in class_name and "no" not in class_name:
                                    has_helmet = True
                                elif "vest" in class_name and "no" not in class_name:
                                    has_vest = True

                    # If the required positive gear is missing on this person, trigger an alert
                    if not has_helmet:
                        alerts.append(
                            {
                                "type": "PPE_VIOLATION",
                                "class": "NO-Hardhat",
                                "confidence": round(p_conf, 2),
                            }
                        )
                    if not has_vest:
                        alerts.append(
                            {
                                "type": "PPE_VIOLATION",
                                "class": "NO-Safety-Vest",
                                "confidence": round(p_conf, 2),
                            }
                        )

            # Extract Fire Alerts
            if fire_results[i] and len(fire_results[i].boxes) > 0:
                for box in fire_results[i].boxes:
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    class_name = fire_results[i].names[cls_id]
                    if class_name.lower() in ["fire", "smoke", "flame"]:
                        alerts.append(
                            {
                                "type": "FIRE_HAZARD",
                                "class": class_name,
                                "confidence": round(conf, 2),
                            }
                        )

            # --- Always draw all boxes for the AI Stream ---
            overlay = frames[i].copy()

            # Fill translucent boxes for violation highlighting
            if ppe_results[i] and len(ppe_results[i].boxes) > 0:
                for box in ppe_results[i].boxes:
                    cls_id = int(box.cls[0])
                    class_name = ppe_results[i].names[cls_id]
                    if "glove" in class_name.lower():
                        continue
                    color_hex = CLASS_COLORS.get(class_name.lower(), "#22c55e").lstrip(
                        "#"
                    )
                    color_bgr = tuple(int(color_hex[j : j + 2], 16) for j in (4, 2, 0))
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), color_bgr, -1)

            if fire_results[i] and len(fire_results[i].boxes) > 0:
                for box in fire_results[i].boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 0, 255), -1)

            alpha = 0.15
            blended_frame = cv2.addWeighted(overlay, alpha, frames[i], 1 - alpha, 0)

            # Plot YOLO native boxes
            if person_results[i]:
                annotated_frame = person_results[i].plot(
                    img=blended_frame, line_width=1
                )
            else:
                annotated_frame = blended_frame

            if ppe_results[i]:
                annotated_frame = ppe_results[i].plot(img=annotated_frame, line_width=1)

            if fire_results[i]:
                annotated_frame = fire_results[i].plot(
                    img=annotated_frame, line_width=1
                )

            # Encode to JPEG
            _, buffer = cv2.imencode(
                ".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 65]
            )
            incident_base64 = "data:image/jpeg;base64," + base64.b64encode(
                buffer
            ).decode("utf-8")

            # Send alerts to Node.js backend for DB storage
            if alerts:
                # Deduplicate alerts by class, keeping the highest confidence one
                unique_alerts = {}
                for a in alerts:
                    cls = a["class"]
                    if (
                        cls not in unique_alerts
                        or a["confidence"] > unique_alerts[cls]["confidence"]
                    ):
                        unique_alerts[cls] = a
                alerts = list(unique_alerts.values())

                import time

                current_time = time.time()
                # Use a set to prevent fluctuating detection counts from breaking the cooldown
                unique_classes = set([a["class"] for a in alerts])
                alert_signature = ",".join(sorted(list(unique_classes)))

                cam_history = last_alert_times.get(cam_id, {})
                last_time = cam_history.get(alert_signature, 0)

                # 60-second cooldown for the exact same alert combo on the same camera
                if current_time - last_time > 60:
                    cam_history[alert_signature] = current_time
                    last_alert_times[cam_id] = cam_history
                    try:
                        # Add frame to the DB payload so the alerts page can display it
                        httpx.post(
                            NODE_API_URL,
                            json={
                                "cameraId": cam_id,
                                "alerts": alerts,
                                "frame": incident_base64,
                            },
                            timeout=2.0,
                        )
                    except:
                        pass

            # --- Send Payload back to React ---
            ws = active_websockets.get(cam_id)
            if ws and main_loop:
                payload = {
                    "type": "ALERTS_UPDATE",
                    "alerts": alerts,
                    "incident_frame": incident_base64,
                }
                asyncio.run_coroutine_threadsafe(ws.send_json(payload), main_loop)

    except Exception as e:
        logger.error(f"Error in process_live_batch: {e}")


def process_entry_batch(batch):
    """
    Entry Check Pipeline: High-precision PPE scan, calculates a Compliance Score.
    No Fire/Smoke model here to save GPU.
    """
    try:
        if not batch:
            return

        frames = [item["frame"] for item in batch]
        camera_ids = [item["camera_id"] for item in batch]

        # High resolution for precise checks at entry
        person_results = (
            person_model(frames, classes=[0], verbose=False, imgsz=640)
            if person_model
            else [None] * len(frames)
        )

        frames_with_people = []
        for res in person_results:
            frames_with_people.append(True if res and len(res.boxes) > 0 else False)

        all_ppe_results = [None] * len(frames)
        all_person_crops = [None] * len(frames)

        for i, frame in enumerate(frames):
            if frames_with_people[i] and ppe_model:
                frame_crops = []
                frame_offsets = []
                for box in person_results[i].boxes:
                    if float(box.conf[0]) < 0.60:
                        continue  # Higher threshold for entry point
                    x1, y1, x2, y2 = map(int, box.xyxy[0])

                    # Smart Cropping: Small margin left/right, HUGE margin on bottom for boots, and some on top for hardhat
                    h, w = frame.shape[:2]
                    cx1, cy1 = max(0, x1 - 150), max(
                        0, y1 - 100
                    )  # 100px top for hardhat, 150px sides for hands
                    cx2, cy2 = min(w, x2 + 150), min(
                        h, y2 + 250
                    )  # 250px bottom for boots!

                    crop = frame[cy1:cy2, cx1:cx2]
                    if crop.size > 0:
                        frame_crops.append(crop)
                        frame_offsets.append((cx1, cy1))

                all_person_crops[i] = frame_offsets
                if frame_crops:
                    all_ppe_results[i] = ppe_model(
                        frame_crops, verbose=False, imgsz=640
                    )

        for i in range(len(frames)):
            cam_id = camera_ids[i]
            frame_h, frame_w = frames[i].shape[:2]
            alerts = []
            json_boxes = []

            # --- Decision Engine State ---
            # We track the highest compliance score for any person in frame
            max_compliance_score = 0
            kiosk_message = None

            if person_results[i]:
                num_people = 0
                for box in person_results[i].boxes:
                    if float(box.conf[0]) >= 0.60:
                        num_people += 1

                if num_people > 1:
                    kiosk_message = "PLEASE COME ONE BY ONE"

                for p_idx, box in enumerate(person_results[i].boxes):
                    conf = float(box.conf[0])
                    if conf < 0.60:
                        continue

                    x1, y1, x2, y2 = map(float, box.xyxy[0])
                    px, py = (x1 / frame_w) * 100, (y1 / frame_h) * 100
                    pw, ph = ((x2 - x1) / frame_w) * 100, ((y2 - y1) / frame_h) * 100

                    if kiosk_message is None:
                        if ph > 85 or pw > 75:
                            kiosk_message = "PLEASE STEP BACK"
                        elif px < 2 or (px + pw) > 98 or py < 2:
                            kiosk_message = "PLEASE STAND IN FRAME"

                    # Worker is detected, analyze their PPE for the compliance score
                    person_score = 0  # Start at 0%

                    # Draw worker box
                    json_boxes.append(
                        {
                            "label": "Scanning Worker...",
                            "color": CLASS_COLORS["Worker"],
                            "x": px,
                            "y": py,
                            "w": pw,
                            "h": ph,
                            "conf": conf,
                        }
                    )

                    # If this person has PPE crops analyzed
                    if all_ppe_results[i] and p_idx < len(all_ppe_results[i]):
                        person_ppe_res = all_ppe_results[i][p_idx]
                        offset_x, offset_y = all_person_crops[i][p_idx]

                        has_hardhat = False
                        has_vest = False
                        has_boots = False

                        for ppe_box in person_ppe_res.boxes:
                            ppe_conf = float(ppe_box.conf[0])
                            cls_id = int(ppe_box.cls[0])
                            class_name = person_ppe_res.names[cls_id]

                            # Lower threshold for gloves because they are small and harder to detect
                            min_conf = 0.20 if "glove" in class_name.lower() else 0.35
                            if ppe_conf < min_conf:
                                continue

                            if (
                                "person" in class_name.lower()
                                or "worker" in class_name.lower()
                                or "glove" in class_name.lower()
                            ):
                                continue

                            ppe_px1, ppe_py1, ppe_px2, ppe_py2 = map(
                                float, ppe_box.xyxy[0]
                            )
                            ppe_x1, ppe_y1 = ppe_px1 + offset_x, ppe_py1 + offset_y
                            ppe_x2, ppe_y2 = ppe_px2 + offset_x, ppe_py2 + offset_y
                            bx, by = (ppe_x1 / frame_w) * 100, (ppe_y1 / frame_h) * 100
                            bw, bh = ((ppe_x2 - ppe_x1) / frame_w) * 100, (
                                (ppe_y2 - ppe_y1) / frame_h
                            ) * 100

                            is_violation = (
                                "no-" in class_name.lower()
                                or "without" in class_name.lower()
                            )
                            if is_violation:
                                color = "#ef4444"
                            else:
                                if (
                                    "hardhat" in class_name.lower()
                                    or "helmet" in class_name.lower()
                                ):
                                    has_hardhat = True
                                if "vest" in class_name.lower():
                                    has_vest = True
                                if (
                                    "boot" in class_name.lower()
                                    or "shoe" in class_name.lower()
                                ):
                                    has_boots = True

                                color = CLASS_COLORS.get(class_name.lower(), "#22c55e")

                            json_boxes.append(
                                {
                                    "label": f"{class_name} {ppe_conf:.2f}",
                                    "color": color,
                                    "x": bx,
                                    "y": by,
                                    "w": bw,
                                    "h": bh,
                                    "conf": ppe_conf,
                                }
                            )

                        # Add score based on detected gear
                        if has_hardhat:
                            person_score += 33
                        if has_vest:
                            person_score += 33
                        if has_boots:
                            person_score += 34

                    person_score = min(100, max(0, person_score))
                    if person_score > max_compliance_score:
                        max_compliance_score = person_score

            # --- Trigger Alerts (Node.js) ---
            if alerts:
                import time

                current_time = time.time()
                unique_classes = set([a["class"] for a in alerts])
                alert_signature = ",".join(sorted(list(unique_classes)))

                cam_history = last_alert_times.get(cam_id, {})
                last_time = cam_history.get(alert_signature, 0)

                if current_time - last_time > 60:
                    cam_history[alert_signature] = current_time
                    last_alert_times[cam_id] = cam_history
                    try:
                        httpx.post(
                            NODE_API_URL,
                            json={"cameraId": cam_id, "alerts": alerts},
                            timeout=2.0,
                        )
                    except:
                        pass

            ws = active_websockets.get(cam_id)
            if ws and main_loop:
                # We inject the compliance score into the payload for the dashboard!
                payload = {
                    "type": "BOUNDING_BOXES",
                    "boxes": json_boxes,
                    "alerts": alerts,
                    "kioskMessage": kiosk_message,
                    "complianceScore": (
                        max_compliance_score
                        if person_results[i] and len(person_results[i].boxes) > 0
                        else None
                    ),
                }
                # Quick hack for JSON null serialization in Python
                if payload["complianceScore"] is None:
                    payload["complianceScore"] = -1  # -1 indicates no person scanned

                asyncio.run_coroutine_threadsafe(ws.send_json(payload), main_loop)

    except Exception as e:
        logger.error(f"Error in process_entry_batch: {e}")


async def live_inference_worker():
    """Background task for LIVE Monitoring cameras."""
    logger.info("Live Inference worker started.")
    global main_loop
    main_loop = asyncio.get_running_loop()

    while True:
        try:
            batch = []
            try:
                first_item = await asyncio.wait_for(live_queue.get(), timeout=1.0)
                batch.append(first_item)
            except asyncio.TimeoutError:
                continue

            while len(batch) < BATCH_SIZE and not live_queue.empty():
                try:
                    batch.append(live_queue.get_nowait())
                except asyncio.QueueEmpty:
                    break

            await asyncio.to_thread(process_live_batch, batch)

            for _ in batch:
                live_queue.task_done()
        except Exception as e:
            logger.error(f"Fatal error in live_inference_worker: {e}")
            await asyncio.sleep(1)


async def entry_inference_worker():
    """Background task for ENTRY cameras."""
    logger.info("Entry Inference worker started.")
    global main_loop
    main_loop = asyncio.get_running_loop()

    while True:
        try:
            batch = []
            try:
                first_item = await asyncio.wait_for(entry_queue.get(), timeout=1.0)
                batch.append(first_item)
            except asyncio.TimeoutError:
                continue

            while len(batch) < BATCH_SIZE and not entry_queue.empty():
                try:
                    batch.append(entry_queue.get_nowait())
                except asyncio.QueueEmpty:
                    break

            await asyncio.to_thread(process_entry_batch, batch)

            for _ in batch:
                entry_queue.task_done()
        except Exception as e:
            logger.error(f"Fatal error in entry_inference_worker: {e}")
            await asyncio.sleep(1)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(live_inference_worker())
    asyncio.create_task(entry_inference_worker())


@app.websocket("/ws/stream/{camera_id}")
async def websocket_endpoint(websocket: WebSocket, camera_id: str):
    await websocket.accept()
    active_websockets[camera_id] = websocket

    is_entry = "_ENTRY" in camera_id
    logger.info(
        f"Camera {camera_id} connected. Pipeline: {'ENTRY' if is_entry else 'LIVE'}"
    )

    target_queue = entry_queue if is_entry else live_queue

    try:
        while True:
            data = await websocket.receive_text()

            if "," in data:
                base64_data = data.split(",")[1]
            else:
                base64_data = data

            img_bytes = base64.b64decode(base64_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame is None:
                continue

            if target_queue.full():
                try:
                    target_queue.get_nowait()
                    target_queue.task_done()
                except asyncio.QueueEmpty:
                    pass

            try:
                target_queue.put_nowait(
                    {"camera_id": camera_id, "frame": frame, "timestamp": time.time()}
                )
            except asyncio.QueueFull:
                pass

    except WebSocketDisconnect:
        logger.info(f"Camera {camera_id} disconnected.")
        if camera_id in active_websockets:
            del active_websockets[camera_id]
    except Exception as e:
        logger.error(f"Error on {camera_id} stream: {e}")
        if camera_id in active_websockets:
            del active_websockets[camera_id]


def generate_frames():
    # Direct AI Video Feed - simulates a factory Zonal Camera
    video_path = r"c:\Users\soumy\OneDrive\Desktop\BPUT-FSTS\factory.mp4"
    cap = cv2.VideoCapture(video_path)

    while True:
        success, frame = cap.read()
        if not success:
            # Loop the video for the demo
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        frame = cv2.resize(frame, (1024, 576))  # Lock aspect ratio

        # Run PPE inference WITH TRACKING (ByteTrack) for sticky boxes
        ppe_results = ppe_model.track(
            frame, persist=True, conf=0.25, verbose=False, tracker="bytetrack.yaml"
        )

        # Run Fire inference
        fire_results = fire_model(frame, conf=0.4, verbose=False)

        # Create an overlay for the translucent fill effect
        overlay = frame.copy()

        alerts = []

        # 1. Fill boxes on overlay (Translucent Fill)
        if ppe_results and len(ppe_results[0].boxes) > 0:
            for box in ppe_results[0].boxes:
                cls_id = int(box.cls[0])
                class_name = ppe_results[0].names[cls_id]

                # Skip gloves
                if "glove" in class_name.lower():
                    continue

                if "person" in class_name.lower() or "worker" in class_name.lower():
                    class_name = "worker"

                color_hex = CLASS_COLORS.get(class_name.lower(), "#22c55e").lstrip("#")
                color_bgr = tuple(
                    int(color_hex[i : i + 2], 16) for i in (4, 2, 0)
                )  # Hex to BGR

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cv2.rectangle(overlay, (x1, y1), (x2, y2), color_bgr, -1)  # Fill

        if fire_results and len(fire_results[0].boxes) > 0:
            for box in fire_results[0].boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 0, 255), -1)  # Red fill

        # Apply low opacity
        alpha = 0.15
        frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)

        # 2. Draw thin stroke borders (NO LABELS)
        if ppe_results and len(ppe_results[0].boxes) > 0:
            for box in ppe_results[0].boxes:
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                class_name = ppe_results[0].names[cls_id]

                if "glove" in class_name.lower():
                    continue

                if "person" in class_name.lower() or "worker" in class_name.lower():
                    class_name = "worker"

                is_violation = (
                    "no-" in class_name.lower() or "without" in class_name.lower()
                )
                if is_violation:
                    alerts.append(
                        {
                            "type": "PPE_VIOLATION",
                            "class": class_name,
                            "confidence": round(conf, 2),
                        }
                    )

                color_hex = CLASS_COLORS.get(class_name.lower(), "#22c55e").lstrip("#")
                color_bgr = tuple(int(color_hex[i : i + 2], 16) for i in (4, 2, 0))

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cv2.rectangle(
                    frame, (x1, y1), (x2, y2), color_bgr, 1
                )  # Thin stroke only, no putText

        if fire_results and len(fire_results[0].boxes) > 0:
            for box in fire_results[0].boxes:
                conf = float(box.conf[0])
                class_name = fire_results[0].names[int(box.cls[0])]
                alerts.append(
                    {
                        "type": "FIRE_HAZARD",
                        "class": class_name,
                        "confidence": round(conf, 2),
                    }
                )

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cv2.rectangle(
                    frame, (x1, y1), (x2, y2), (0, 0, 255), 1
                )  # Thin red stroke

        if alerts:
            try:
                # Send alerts to Node backend so the dashboard still counts them
                httpx.post(
                    NODE_API_URL,
                    json={"cameraId": "direct_cam", "alerts": alerts},
                    timeout=1.0,
                )
            except:
                pass

        ret, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        frame_bytes = buffer.tobytes()
        yield (
            b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
        )

    cap.release()


@app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame"
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
