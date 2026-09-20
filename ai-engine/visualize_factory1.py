"""
Visualize factory-1 labels to identify class names.
Opens 5 sample images with colored bboxes drawn.
Each color = one class ID. Look at the images and tell us
what each color corresponds to.
"""

import cv2
import numpy as np
from pathlib import Path

BASE_DIR   = Path(__file__).parent.parent
F1_IMAGES  = BASE_DIR / "factory-1" / "data" / "images" / "train"
F1_LABELS  = BASE_DIR / "factory-1" / "data" / "labels" / "train"
OUT_DIR    = BASE_DIR / "ai-engine" / "data" / "class_check"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Distinct colors for each class 0-6
COLORS = [
    (0,   0,   255),   # 0 → RED
    (0,   255, 0),     # 1 → GREEN
    (255, 0,   0),     # 2 → BLUE
    (0,   255, 255),   # 3 → YELLOW
    (255, 0,   255),   # 4 → MAGENTA
    (255, 128, 0),     # 5 → ORANGE
    (128, 0,   255),   # 6 → PURPLE
]

CLASS_LABELS = ["0-RED", "1-GREEN", "2-BLUE", "3-YELLOW", "4-MAGENTA", "5-ORANGE", "6-PURPLE"]

# Get images that have labels with different classes
image_files = sorted(F1_IMAGES.glob("*.jpg"))[:20]

count = 0
for img_path in image_files:
    lbl_path = F1_LABELS / (img_path.stem + ".txt")
    if not lbl_path.exists():
        continue

    lines = [l.strip() for l in lbl_path.read_text().splitlines() if l.strip()]
    if not lines:
        continue

    classes_in_file = set(int(l.split()[0]) for l in lines)

    # Only use images that have at least 3 different classes
    if len(classes_in_file) < 3:
        continue

    img = cv2.imread(str(img_path))
    if img is None:
        continue

    h, w = img.shape[:2]

    for line in lines:
        parts = line.split()
        cls = int(parts[0])
        cx, cy, bw, bh = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])

        # Convert to pixel coords
        x1 = int((cx - bw/2) * w)
        y1 = int((cy - bh/2) * h)
        x2 = int((cx + bw/2) * w)
        y2 = int((cy + bh/2) * h)

        color = COLORS[cls] if cls < len(COLORS) else (255, 255, 255)
        label = CLASS_LABELS[cls] if cls < len(CLASS_LABELS) else str(cls)

        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        cv2.putText(img, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    out_path = OUT_DIR / f"check_{img_path.name}"
    cv2.imwrite(str(out_path), img)
    print(f"Saved: {out_path}")
    print(f"  Classes in this image: {sorted(classes_in_file)}")

    count += 1
    if count >= 5:
        break

print(f"\nDone. Open these {count} images from:")
print(f"  {OUT_DIR}")
print(f"\nColor → Class ID:")
for i, label in enumerate(CLASS_LABELS):
    print(f"  {label}")
print(f"\nTell us what each color box is pointing at in the images.")
print(f"(e.g., 'RED boxes are on helmets', 'PURPLE boxes are on people')")
