import cv2
from ultralytics import YOLO
import sys

# Paths
VIDEO_PATH = r"c:\Users\soumy\OneDrive\Desktop\BPUT-FSTS\factory.mp4"
PPE_MODEL_PATH = "models/ppe_detection_model.pt"
FIRE_MODEL_PATH = "models/fire_model_indoor.pt"

print("Loading models... (this might take a few seconds)")
try:
    ppe_model = YOLO(PPE_MODEL_PATH)
    fire_model = YOLO(FIRE_MODEL_PATH)
    print("Models loaded successfully!")
except Exception as e:
    print(f"Error loading models: {e}")
    sys.exit(1)

# Print out the class names the models expect
print("\nPPE Model Classes:", ppe_model.names)
print("Fire Model Classes:", fire_model.names)
print("-" * 50)

# Open video
cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print(f"Error: Could not open video at {VIDEO_PATH}")
    sys.exit(1)

print("Starting inference... Press 'q' to stop.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("End of video stream.")
        break

    # Resize frame for faster inference/display if it's too large
    frame = cv2.resize(frame, (1024, 576))  # 16:9 aspect ratio

    # Run PPE inference WITH TRACKING (ByteTrack)
    # Lowered conf to 0.25 to catch more people, gloves, and boots
    ppe_results = ppe_model.track(frame, persist=True, conf=0.25, verbose=False, tracker="bytetrack.yaml")

    # Run Fire inference
    fire_results = fire_model(frame, conf=0.4, verbose=False)

    # Create an overlay for the translucent fill effect
    overlay = frame.copy()

    # Fill PPE boxes
    for box in ppe_results[0].boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cv2.rectangle(overlay, (x1, y1), (x2, y2), (255, 144, 30), -1)  # Blueish fill

    # Fill Fire boxes
    for box in fire_results[0].boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 0, 255), -1)  # Red fill for fire

    # Apply the low opacity (alpha = 0.15)
    alpha = 0.15
    frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)

    # Plot both results onto the frame with reduced stroke width (line_width=1)
    # We plot PPE first, then Fire on top
    annotated_frame = ppe_results[0].plot(img=frame, line_width=1)
    annotated_frame = fire_results[0].plot(img=annotated_frame, line_width=1)

    # Show the frame
    cv2.imshow("Model Test Pipeline (Press 'q' to quit)", annotated_frame)

    # Press 'q' to exit (wait 66ms to achieve ~0.5x playback speed)
    if cv2.waitKey(66) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("Testing complete.")
