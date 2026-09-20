BPUT-FSTS Models Directory
==========================

Git is configured to IGNORE all .pt files and runs/ folders in this directory because model weights are too large for source control. 

When setting up this project on a new machine, you must manually download the trained models and place them here or use your trained models.

REQUIRED MODELS:
----------------
1. fire_model.pt   (Trained on D-Fire or Indoor Fire Smoke datasets)
2. ppe_model.pt    (Trained on Factory-2 PPE dataset)

NAMING CONVENTION:
------------------
The pipeline script (test_pipeline.py) specifically looks for the exact filenames:
- "fire_model.pt" (not fire_smoke_v1.pt)
- "ppe_model.pt"  (not ppe_nano.pt)

If you train a new version of the model, rename it to match the above names before running the detection pipeline.
