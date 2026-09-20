"""
Quick PPE Test Model — YOLOv8n (Nano)
Purpose: Fast initial model for pipeline testing
Time   : ~25-35 minutes on RTX 3050
Output : models/ppe_model_nano.pt

Run this first to test the full detection pipeline.
Then run train_ppe.py for the full YOLOv8s model.
"""

from ultralytics import YOLO
from pathlib import Path
import torch
import yaml
import shutil


def main():
    print("=" * 60)
    print("  PPE Quick Test Model (YOLOv8n Nano)")
    print("  Purpose: pipeline testing, not final model")
    print("=" * 60)
    print(f"\nCUDA : {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU  : {torch.cuda.get_device_name(0)}")
        vram = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"VRAM : {vram:.1f} GB")
    print()

    # ── Paths ─────────────────────────────────────────────────────────────────
    BASE_DIR     = Path(__file__).parent.parent
    FACTORY2_DIR = BASE_DIR / "factory-2"
    MODELS_DIR   = BASE_DIR / "ai-engine" / "models"
    DATA_YAML    = BASE_DIR / "ai-engine" / "data" / "ppe_dataset" / "data.yaml"
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # ── Write data.yaml ───────────────────────────────────────────────────────
    PPE_DATA_DIR = BASE_DIR / "ai-engine" / "data" / "ppe_dataset"
    PPE_DATA_DIR.mkdir(parents=True, exist_ok=True)

    data_yaml_content = {
        "path": str(FACTORY2_DIR).replace("\\", "/"),
        "train": "train/images",
        "val":   "valid/images",
        "test":  "test/images",
        "nc":    6,
        "names": ["Boots", "Gloves", "Mask", "Safety-Helmet", "Safety-Vest", "Safety-Wearpack"]
    }
    with open(DATA_YAML, "w") as f:
        yaml.dump(data_yaml_content, f, default_flow_style=False, sort_keys=False)

    print(f"Dataset : {FACTORY2_DIR}")
    print(f"Model   : YOLOv8n (nano) — fast test model")
    print()

    # ── YOLOv8n — much smaller and faster than YOLOv8s ───────────────────────
    model = YOLO("yolov8n.pt")   # nano, not small

    results = model.train(
        data         = str(DATA_YAML),
        epochs       = 20,            # just enough to get working detections
        imgsz        = 512,
        batch        = 16,            # nano is tiny — 16 is safe
        device       = 0,
        workers      = 2,
        patience     = 10,
        save         = True,
        plots        = True,
        name         = "ppe_nano_v1",
        project      = str(MODELS_DIR / "runs"),
        exist_ok     = True,
        optimizer    = "AdamW",
        lr0          = 0.001,
        lrf          = 0.01,
        momentum     = 0.937,
        weight_decay = 0.0005,
        hsv_h        = 0.015,
        hsv_s        = 0.7,
        hsv_v        = 0.4,
        fliplr       = 0.5,
        mosaic       = 1.0,
        mixup        = 0.1,
    )

    # ── Save weights ──────────────────────────────────────────────────────────
    best_weights = Path(results.save_dir) / "weights" / "best.pt"
    dest = MODELS_DIR / "ppe_model_nano.pt"

    if best_weights.exists():
        shutil.copy2(best_weights, dest)
        print(f"\n{'=' * 60}")
        print(f"  Quick PPE model ready!")
        print(f"  Saved → {dest}")
        print(f"{'=' * 60}")
        print(f"\nmAP50    : {results.results_dict.get('metrics/mAP50(B)', 'N/A'):.4f}")
        print(f"Precision: {results.results_dict.get('metrics/precision(B)', 'N/A'):.4f}")
        print(f"Recall   : {results.results_dict.get('metrics/recall(B)', 'N/A'):.4f}")
        print(f"\nNext steps:")
        print(f"  1. python test_pipeline.py  ← test full detection pipeline")
        print(f"  2. python train_ppe.py       ← train full YOLOv8s model later")
    else:
        print(f"\nWARNING: best.pt not found.")


if __name__ == "__main__":
    main()
