# BPUT-FSTS AI Engine

This is the core AI engine for the BPUT-FSTS (Factory Safety Tracking System) project. It uses YOLOv8 to run dual object detection models:
1. **Fire & Smoke Detection** (Hazards)
2. **Personal Protective Equipment (PPE) Detection** (Compliance)

## Structure
- `data/` - Datasets and preparation scripts (ignored by git due to size)
- `models/` - Trained `.pt` weights and training outputs (ignored by git). *You must place your `fire_model.pt` and `ppe_model.pt` here.*
- `train_fire.py` - Script for training the fire & smoke model.
- `train_ppe.py` - Script for training the full PPE model.
- `train_ppe_nano.py` - Script for training a quick PPE test model.
- `test_pipeline.py` - The core inference pipeline to test detection on a video file or webcam.

## Setup

1. **Create and activate a virtual environment (Windows):**
   ```powershell
   python -m venv .venv
   .venv\Scripts\activate
   ```

2. **Install requirements:**
   ```powershell
   pip install -r requirements.txt
   ```

3. **Install PyTorch with CUDA (if using GPU):**
   *(Note: The requirements.txt installs CPU versions by default or whatever pip resolves. To ensure GPU support on Windows with RTX 3050, install PyTorch with the correct CUDA version manually if needed).*
   ```powershell
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
   ```

## Running the Pipeline

Before running the pipeline, ensure you have downloaded the trained models (`fire_model.pt` and `ppe_model.pt`) and placed them inside the `models/` folder.

**Test on Webcam:**
```powershell
python test_pipeline.py --source 0
```

**Test on Video File:**
```powershell
python test_pipeline.py --source "path\to\video.mp4"
```

**Save the Output:**
```powershell
python test_pipeline.py --source "path\to\video.mp4" --save
```
*(The annotated video will be saved to the `evidence/` folder).*

## Notes on Models
- The system is optimized for a 4GB VRAM GPU (like RTX 3050).
- Windows multiprocessing can cause issues with YOLO dataloaders, so training scripts are configured with `workers=2` and an `if __name__ == "__main__":` guard.
