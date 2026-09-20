"""
Train YOLOv8s PPE Detection Model
Dataset : factory-2 (Boots, Gloves, Mask, Safety-Helmet, Safety-Vest, Safety-Wearpack)
Hardware: NVIDIA RTX 3050 4GB VRAM

Class mapping (inference will use only 4 of these):
  0 → Boots              ✅ used
  1 → Gloves             ✅ used
  2 → Mask               ✗  ignored at inference
  3 → Safety-Helmet      ✅ used
  4 → Safety-Vest        ✅ used
  5 → Safety-Wearpack    ✗  ignored at inference
"""

from ultralytics import YOLO
from pathlib import Path
import torch
import yaml
import shutil


def main():
    # ── Verify GPU ────────────────────────────────────────────────────────────
    print("=" * 60)
    print("  PPE Model Training")
    print("=" * 60)
    print(f"\nCUDA available : {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU            : {torch.cuda.get_device_name(0)}")
        print(f"VRAM           : {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print()

    # ── Paths ─────────────────────────────────────────────────────────────────
    BASE_DIR     = Path(__file__).parent.parent
    FACTORY2_DIR = BASE_DIR / "factory-2"
    MODELS_DIR   = BASE_DIR / "ai-engine" / "models"
    DATA_YAML    = BASE_DIR / "ai-engine" / "data" / "ppe_dataset" / "data.yaml"
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # ── Write clean data.yaml with absolute paths ─────────────────────────────
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

    print(f"Dataset : {DATA_YAML}")
    print(f"Output  : {MODELS_DIR}")
    print("\nClasses:")
    for i, name in enumerate(data_yaml_content["names"]):
        used = "✅ used at inference" if i in [0, 1, 3, 4] else "✗  ignored at inference"
        print(f"  {i} → {name:<20} {used}")
    print()

    # ── Load pretrained YOLOv8s ───────────────────────────────────────────────
    model = YOLO("yolov8s.pt")

    # ── Training ──────────────────────────────────────────────────────────────
    results = model.train(
        data         = str(DATA_YAML),
        epochs       = 40,            # with patience=20, early stopping handles the rest
        imgsz        = 512,            # 512 for PPE — gloves/helmets are small, need more res than 416
        batch        = 8,             # safe for 4GB VRAM
        device       = 0,
        workers      = 2,            # safe now — __main__ guard is in place
        patience     = 20,
        save         = True,
        plots        = True,
        name         = "ppe_v1",
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
        mixup        = 0.15,
        degrees      = 5.0,
        translate    = 0.1,
        scale        = 0.5,
        copy_paste   = 0.1,
    )

    # ── Save best weights ─────────────────────────────────────────────────────
    best_weights = Path(results.save_dir) / "weights" / "best.pt"
    dest = MODELS_DIR / "ppe_model.pt"

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
        print(f"\nNext: python test_pipeline.py")
    else:
        print(f"\nWARNING: best.pt not found at {best_weights}")


# ── Windows multiprocessing guard (required on Windows) ──────────────────────
if __name__ == "__main__":
    main()
