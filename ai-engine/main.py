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
PERSON_MODEL_PATH = "yolov8n.pt"  # Lightweight model just for person detection
PPE_MODEL_PATH = "models/ppe_detection_model.pt"  
FIRE_MODEL_PATH = "models/fire_model.pt"

NODE_API_URL = "http://localhost:4000/api/alerts"
BATCH_SIZE = 4
MAX_QUEUE_SIZE = 8

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
        frames = [cv2.resize(f, (640, 640)) for f in orig_frames]
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

        # 2. Run PPE Model ONLY on frames that have people!
        ppe_results = []
        for i, frame in enumerate(frames):
            if frames_with_people[i] and ppe_model:
                res = ppe_model(frame, verbose=False)[0]
                ppe_results.append(res)
            else:
                ppe_results.append(None)
        
        # 3. Run Fire/Smoke Model on ALL frames
        fire_results = fire_model(frames, verbose=False) if fire_model else [None] * len(frames)

        for i in range(len(frames)):
            cam_id = camera_ids[i]
            alerts = []
            json_boxes = []
            
            # --- Process Person Boxes ---
            if person_results[i]:
                for box in person_results[i].boxes:
                    conf = float(box.conf[0])
                    if conf < 0.35: continue
                    
                    x1, y1, x2, y2 = map(float, box.xyxy[0])
                    # Convert to percentages relative to the 640x640 frame
                    px, py = (x1 / 640) * 100, (y1 / 640) * 100
                    pw, ph = ((x2 - x1) / 640) * 100, ((y2 - y1) / 640) * 100
                    
                    json_boxes.append({
                        "label": "Worker",
                        "color": "#d4d4d8", # zinc-300
                        "x": px, "y": py, "w": pw, "h": ph
                    })

            # --- Process PPE Results ---
            if ppe_results[i]:
                for box in ppe_results[i].boxes:
                    conf = float(box.conf[0])
                    if conf < 0.25: continue # Lower threshold to detect multiple PPE kits
                    
                    cls_id = int(box.cls[0])
                    class_name = ppe_results[i].names[cls_id]
                    
                    # Prevent duplicate person boxes since the Person Tracker already drew 'Worker'
                    if "person" in class_name.lower():
                        continue
                    
                    x1, y1, x2, y2 = map(float, box.xyxy[0])
                    px, py = (x1 / 640) * 100, (y1 / 640) * 100
                    pw, ph = ((x2 - x1) / 640) * 100, ((y2 - y1) / 640) * 100
                    
                    is_violation = ("no-" in class_name.lower() or "without" in class_name.lower())
                    color = "#ef4444" if is_violation else "#22c55e" # red / green
                    
                    if is_violation:
                        alerts.append({
                            "type": "PPE_VIOLATION",
                            "class": class_name,
                            "confidence": round(conf, 2)
                        })

                    json_boxes.append({
                        "label": f"{class_name} {conf:.2f}",
                        "color": color,
                        "x": px, "y": py, "w": pw, "h": ph
                    })

            # --- Process Fire/Smoke Results ---
            if fire_results[i]:
                for box in fire_results[i].boxes:
                    conf = float(box.conf[0])
                    if conf < 0.45: continue
                    
                    cls_id = int(box.cls[0])
                    class_name = fire_results[i].names[cls_id]
                    
                    x1, y1, x2, y2 = map(float, box.xyxy[0])
                    px, py = (x1 / 640) * 100, (y1 / 640) * 100
                    pw, ph = ((x2 - x1) / 640) * 100, ((y2 - y1) / 640) * 100
                    
                    color = "#f97316" # orange
                    if class_name.lower() in ["fire", "smoke", "flame"]:
                        alerts.append({
                            "type": "FIRE_HAZARD",
                            "class": class_name,
                            "confidence": round(conf, 2)
                        })
                    
                    json_boxes.append({
                        "label": f"🔥 {class_name.upper()} {conf:.2f}",
                        "color": color,
                        "x": px, "y": py, "w": pw, "h": ph
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
