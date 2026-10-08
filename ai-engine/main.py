import asyncio
import cv2
import numpy as np
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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
PPE_MODEL_PATH = "models/ppe/ppe_v3.pt"            # Latest PPE Version
FIRE_MODEL_PATH = "models/fire_smoke/fire_indoor_v2.pt" # The REAL trained Fire/Smoke model

NODE_API_URL = "http://localhost:4000/api/alerts"
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
frame_queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
active_websockets = {}  # { camera_id: websocket }
main_loop = None  # Will be set to the asyncio event loop

def process_batch(batch):
    """
    Run YOLO inference on a batch of frames, draw bounding boxes, 
    and send annotated frames back to the React Dashboard via WebSocket.
    """
    try:
        if not batch:
            return

        orig_frames = [item["frame"] for item in batch]
        # DO NOT squish the aspect ratio! YOLO automatically letterboxes to preserve proportions.
        frames = orig_frames
        camera_ids = [item["camera_id"] for item in batch]
        
        # 1. Run Person Detection First (Class 0 is 'person' in COCO)
        person_results = person_model(frames, classes=[0], verbose=False) if person_model else [None] * len(frames)
        
        # Determine which frames actually have a person in them
        frames_with_people = []
        for res in person_results:
            has_person = False
            if res and len(res.boxes) > 0:
                has_person = True
            frames_with_people.append(has_person)

        # 2. Run PPE Model ONLY on cropped regions of people!
        all_ppe_results = [None] * len(frames)
        all_person_crops = [None] * len(frames) # list of lists of (cx1, cy1)
        
        for i, frame in enumerate(frames):
            if frames_with_people[i] and ppe_model:
                frame_crops = []
                frame_offsets = []
                for box in person_results[i].boxes:
                    if float(box.conf[0]) < 0.45: continue # Match the drawing threshold!
                    
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    
                    # Add a safe margin around the person so helmets/shoes aren't cut off
                    margin = 30
                    h, w = frame.shape[:2]
                    cx1 = max(0, x1 - margin)
                    cy1 = max(0, y1 - margin)
                    cx2 = min(w, x2 + margin)
                    cy2 = min(h, y2 + margin)
                    
                    crop = frame[cy1:cy2, cx1:cx2]
                    if crop.size > 0:
                        frame_crops.append(crop)
                        frame_offsets.append((cx1, cy1))
                
                all_person_crops[i] = frame_offsets
                
                # Run PPE on all cropped people simultaneously!
                if frame_crops:
                    all_ppe_results[i] = ppe_model(frame_crops, verbose=False)
        
        # 3. Run Fire/Smoke Model on ALL frames
        fire_results = fire_model(frames, verbose=False) if fire_model else [None] * len(frames)

        for i in range(len(frames)):
            cam_id = camera_ids[i]
            frame_h, frame_w = frames[i].shape[:2]
            alerts = []
            json_boxes = []
            
            # --- Define Premium Color Palette ---
            CLASS_COLORS = {
                "Worker": "#ffffff",         # White
                "helmet": "#eab308",         # Yellow (Classic hardhat)
                "vest": "#3b82f6",           # Blue
                "boots": "#8b5cf6",          # Purple
                "gloves": "#14b8a6",         # Teal
                "glasses": "#ec4899",        # Pink
                "fire": "#f97316",           # Orange
                "smoke": "#94a3b8",          # Slate Gray
                "flame": "#f97316",          # Orange
            }
            # All violations will default to Red (#ef4444)
            # Anything else defaults to Green (#22c55e)

            # --- Process Person Boxes ---
            if person_results[i]:
                for box in person_results[i].boxes:
                    conf = float(box.conf[0])
                    if conf < 0.45: continue  # Restored to 0.45 to prevent hallucinating people on background objects!
                    
                    x1, y1, x2, y2 = map(float, box.xyxy[0])
                    # Convert to percentages relative to the true frame dimensions
                    px, py = (x1 / frame_w) * 100, (y1 / frame_h) * 100
                    pw, ph = ((x2 - x1) / frame_w) * 100, ((y2 - y1) / frame_h) * 100
                    
                    json_boxes.append({
                        "label": "Worker",
                        "color": CLASS_COLORS["Worker"],
                        "x": px, "y": py, "w": pw, "h": ph, "conf": conf
                    })

            # --- Process PPE Results ---
            if all_ppe_results[i]:
                for p_idx, person_ppe_res in enumerate(all_ppe_results[i]):
                    offset_x, offset_y = all_person_crops[i][p_idx]
                    for box in person_ppe_res.boxes:
                        conf = float(box.conf[0])
                        if conf < 0.25: continue
                        
                        cls_id = int(box.cls[0])
                        class_name = person_ppe_res.names[cls_id]
                        
                        if "person" in class_name.lower() or "worker" in class_name.lower():
                            continue
                        
                        px1, py1, px2, py2 = map(float, box.xyxy[0])
                        x1 = px1 + offset_x
                        y1 = py1 + offset_y
                        x2 = px2 + offset_x
                        y2 = py2 + offset_y
                        
                        px, py = (x1 / frame_w) * 100, (y1 / frame_h) * 100
                        pw, ph = ((x2 - x1) / frame_w) * 100, ((y2 - y1) / frame_h) * 100
                        
                        is_violation = ("no-" in class_name.lower() or "without" in class_name.lower())
                        
                        # Determine exact color based on class
                        if is_violation:
                            color = "#ef4444" # Red for violations
                            alerts.append({
                                "type": "PPE_VIOLATION",
                                "class": class_name,
                                "confidence": round(conf, 2)
                            })
                        else:
                            # Use mapped color, or fallback to green
                            color = CLASS_COLORS.get(class_name.lower(), "#22c55e")
                            
                        json_boxes.append({
                            "label": f"{class_name} {conf:.2f}",
                            "color": color,
                            "x": px, "y": py, "w": pw, "h": ph, "conf": conf
                        })

            # --- Process Fire/Smoke Results ---
            if fire_results[i]:
                for box in fire_results[i].boxes:
                    conf = float(box.conf[0])
                    if conf < 0.45: continue
                    
                    cls_id = int(box.cls[0])
                    class_name = fire_results[i].names[cls_id]
                    
                    # CRITICAL FIX: The fire model might have been trained on a dataset that included "person".
                    # We MUST ignore anything that isn't explicitly fire, smoke, or flame!
                    if class_name.lower() not in ["fire", "smoke", "flame"]:
                        continue
                        
                    x1, y1, x2, y2 = map(float, box.xyxy[0])
                    px, py = (x1 / frame_w) * 100, (y1 / frame_h) * 100
                    pw, ph = ((x2 - x1) / frame_w) * 100, ((y2 - y1) / frame_h) * 100
                    
                    color = CLASS_COLORS.get(class_name.lower(), "#f97316") # Fallback to orange
                    
                    alerts.append({
                        "type": "FIRE_HAZARD",
                        "class": class_name,
                        "confidence": round(conf, 2)
                    })
                    
                    json_boxes.append({
                        "label": f"🔥 {class_name.upper()} {conf:.2f}",
                        "color": color,
                        "x": px, "y": py, "w": pw, "h": ph, "conf": conf
                    })
            
            # --- Trigger Alerts (Node.js) ---
            if alerts:
                try:
                    httpx.post(NODE_API_URL, json={"cameraId": cam_id, "alerts": alerts}, timeout=2.0)
                except: pass

            # --- Send JSON Boxes to Dashboard ---
            ws = active_websockets.get(cam_id)
            if ws and main_loop:
                payload = {
                    "type": "BOUNDING_BOXES",
                    "boxes": json_boxes,
                    "alerts": alerts
                }
                asyncio.run_coroutine_threadsafe(ws.send_json(payload), main_loop)

    except Exception as e:
        logger.error(f"Error in process_batch: {e}")


async def inference_worker():
    """Background task to constantly pull frames from the queue and process in batches."""
    logger.info("Inference worker started.")
    global main_loop
    main_loop = asyncio.get_running_loop()
    
    while True:
        try:
            batch = []
            try:
                first_item = await asyncio.wait_for(frame_queue.get(), timeout=1.0)
                batch.append(first_item)
            except asyncio.TimeoutError:
                continue
                
            while len(batch) < BATCH_SIZE and not frame_queue.empty():
                try:
                    batch.append(frame_queue.get_nowait())
                except asyncio.QueueEmpty:
                    break
                    
            await asyncio.to_thread(process_batch, batch)
            
            for _ in batch:
                frame_queue.task_done()
        except Exception as e:
            logger.error(f"Fatal error in inference_worker loop: {e}")
            await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(inference_worker())

@app.websocket("/ws/stream/{camera_id}")
async def websocket_endpoint(websocket: WebSocket, camera_id: str):
    await websocket.accept()
    active_websockets[camera_id] = websocket
    logger.info(f"Camera {camera_id} connected to AI Engine.")
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

            # Keep only the absolute newest frames to ensure zero latency
            if frame_queue.full():
                try:
                    frame_queue.get_nowait()
                    frame_queue.task_done()
                except asyncio.QueueEmpty:
                    pass
            
            try:
                frame_queue.put_nowait({
                    "camera_id": camera_id,
                    "frame": frame,
                    "timestamp": time.time()
                })
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
