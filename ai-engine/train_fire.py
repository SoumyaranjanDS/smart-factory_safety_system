"""
Train YOLOv8s Fire/Smoke Detection Model
Dataset : D-Fire (fire=0, smoke=1)
Hardware: NVIDIA RTX 3050 4GB VRAM
"""

from ultralytics import YOLO
from pathlib import Path
import torch
import shutil


def main():
    # ── Verify GPU ────────────────────────────────────────────────────────────
    print("=" * 60)
    print("  Fire/Smoke Model Training")
    print("=" * 60)
    print(f"\nCUDA available : {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU            : {torch.cuda.get_device_name(0)}")
        print(f"VRAM           : {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    else:
        print("WARNING: No GPU detected. Training on CPU will be very slow.")

    print()

    # ── Paths ─────────────────────────────────────────────────────────────────
    BASE_DIR   = Path(__file__).parent.parent
    DATA_YAML  = BASE_DIR / "ai-engine" / "data" / "fire_dataset" / "data.yaml"
    MODELS_DIR = BASE_DIR / "ai-engine" / "models"
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    if not DATA_YAML.exists():
        print(f"ERROR: data.yaml not found at {DATA_YAML}")
        print("Run prepare_fire_dataset.py first.")
        return

    print(f"Dataset : {DATA_YAML}")
    print(f"Output  : {MODELS_DIR}")
    print()

    # ── Load pretrained YOLOv8s ───────────────────────────────────────────────
    model = YOLO("yolov8s.pt")

    # ── Training ──────────────────────────────────────────────────────────────
    results = model.train(
        data         = str(DATA_YAML),
        epochs       = 30,            # reduced — early stopping (patience=15) handles the rest
        imgsz        = 416,            # reduced from 640 — ~60% faster, minimal accuracy loss
        batch        = 8,             # reduced from 16 — 3.7G was too close to 4G limit
        device       = 0,
        workers      = 2,            # safe now — __main__ guard is in place, GPU won't idle
        patience     = 15,
        save         = True,
        plots        = True,
        name         = "fire_smoke_v1",
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
        flipud       = 0.0,
        fliplr       = 0.5,
        mosaic       = 1.0,
        mixup        = 0.1,
    )

    # ── Save best weights ─────────────────────────────────────────────────────
    best_weights = Path(results.save_dir) / "weights" / "best.pt"
    dest = MODELS_DIR / "fire_model.pt"

    if best_weights.exists():
        shutil.copy2(best_weights, dest)
        print(f"\n{'=' * 60}")
        print(f"  Training complete!")
        print(f"  Best weights saved → {dest}")
        print(f"{'=' * 60}")
        print(f"\nModel metrics:")
        print(f"  mAP50    : {results.results_dict.get('metrics/mAP50(B)', 'N/A'):.4f}")
        print(f"  mAP50-95 : {results.results_dict.get('metrics/mAP50-95(B)', 'N/A'):.4f}")
        print(f"  Precision : {results.results_dict.get('metrics/precision(B)', 'N/A'):.4f}")
        print(f"  Recall    : {results.results_dict.get('metrics/recall(B)', 'N/A'):.4f}")
        print(f"\nNext: python train_ppe.py")
    else:
        print(f"\nWARNING: best.pt not found at {best_weights}")


# ── Windows multiprocessing guard (required on Windows) ──────────────────────
if __name__ == "__main__":
    main()
