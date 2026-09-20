"""
Prepares the D-Fire dataset for YOLOv8 training.
- Splits train set into train (85%) and val (15%)
- Creates data.yaml config file
- Prints dataset statistics
"""

import os
import shutil
import random
import yaml
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR       = Path(__file__).parent.parent  # BPUT-FSTS/
DFIRE_DIR      = BASE_DIR / "D-Fire"
PREPARED_DIR   = BASE_DIR / "ai-engine" / "data" / "fire_dataset"

DFIRE_TRAIN_IMGS   = DFIRE_DIR / "train" / "images"
DFIRE_TRAIN_LBLS   = DFIRE_DIR / "train" / "labels"
DFIRE_TEST_IMGS    = DFIRE_DIR / "test"  / "images"
DFIRE_TEST_LBLS    = DFIRE_DIR / "test"  / "labels"

VAL_SPLIT = 0.15   # 15% of train → val
SEED      = 42

# ── Create output folders ─────────────────────────────────────────────────────
for split in ["train", "val", "test"]:
    (PREPARED_DIR / split / "images").mkdir(parents=True, exist_ok=True)
    (PREPARED_DIR / split / "labels").mkdir(parents=True, exist_ok=True)

print("=" * 60)
print("  D-Fire Dataset Preparation")
print("=" * 60)

# ── Get all training images ───────────────────────────────────────────────────
all_images = sorted(list(DFIRE_TRAIN_IMGS.glob("*.jpg")) +
                    list(DFIRE_TRAIN_IMGS.glob("*.png")) +
                    list(DFIRE_TRAIN_IMGS.glob("*.jpeg")))

print(f"\nTotal training images found: {len(all_images)}")

# ── Shuffle and split ─────────────────────────────────────────────────────────
random.seed(SEED)
random.shuffle(all_images)

val_count    = int(len(all_images) * VAL_SPLIT)
val_images   = all_images[:val_count]
train_images = all_images[val_count:]

print(f"Train split : {len(train_images)} images")
print(f"Val   split : {len(val_images)} images")

# ── Copy function ─────────────────────────────────────────────────────────────
def copy_split(image_list, split_name, src_label_dir):
    img_dir = PREPARED_DIR / split_name / "images"
    lbl_dir = PREPARED_DIR / split_name / "labels"
    copied_imgs = 0
    copied_lbls = 0
    missing_lbls = 0

    for img_path in image_list:
        lbl_path = src_label_dir / (img_path.stem + ".txt")

        shutil.copy2(img_path, img_dir / img_path.name)
        copied_imgs += 1

        if lbl_path.exists():
            shutil.copy2(lbl_path, lbl_dir / lbl_path.name)
            copied_lbls += 1
        else:
            # Create empty label file (negative sample)
            (lbl_dir / (img_path.stem + ".txt")).touch()
            missing_lbls += 1

    print(f"\n[{split_name}]")
    print(f"  Images copied : {copied_imgs}")
    print(f"  Labels copied : {copied_lbls}")
    print(f"  Empty labels  : {missing_lbls} (negative samples — OK)")

# ── Copy train and val ────────────────────────────────────────────────────────
copy_split(train_images, "train", DFIRE_TRAIN_LBLS)
copy_split(val_images,   "val",   DFIRE_TRAIN_LBLS)

# ── Copy test set ─────────────────────────────────────────────────────────────
test_images = sorted(list(DFIRE_TEST_IMGS.glob("*.jpg")) +
                     list(DFIRE_TEST_IMGS.glob("*.png")))

copy_split(test_images, "test", DFIRE_TEST_LBLS)

# ── Write data.yaml ───────────────────────────────────────────────────────────
data_yaml = {
    "path": str(PREPARED_DIR).replace("\\", "/"),
    "train": "train/images",
    "val":   "val/images",
    "test":  "test/images",
    "nc":    2,
    "names": ["fire", "smoke"]
}

yaml_path = PREPARED_DIR / "data.yaml"
with open(yaml_path, "w") as f:
    yaml.dump(data_yaml, f, default_flow_style=False, sort_keys=False)

print(f"\n{'=' * 60}")
print(f"  data.yaml written to: {yaml_path}")
print(f"{'=' * 60}")

# ── Final stats ───────────────────────────────────────────────────────────────
print(f"\nDataset summary:")
print(f"  Train  : {len(train_images)} images")
print(f"  Val    : {len(val_images)} images")
print(f"  Test   : {len(test_images)} images")
print(f"  Classes: fire (0), smoke (1)")
print(f"\nNext: python train_fire.py")
