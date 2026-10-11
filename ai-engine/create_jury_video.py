import cv2
import os

images = [
    r"C:\Users\soumy\.gemini\antigravity-ide\brain\0e7434ca-b021-4c85-b18b-f3d5e5dc29fa\worker_perfect_1791577417171.jpg",
    r"C:\Users\soumy\.gemini\antigravity-ide\brain\0e7434ca-b021-4c85-b18b-f3d5e5dc29fa\worker_missing_hardhat_1791577427448.jpg",
    r"C:\Users\soumy\.gemini\antigravity-ide\brain\0e7434ca-b021-4c85-b18b-f3d5e5dc29fa\worker_missing_gloves_1791577441182.jpg",
    r"C:\Users\soumy\.gemini\antigravity-ide\brain\0e7434ca-b021-4c85-b18b-f3d5e5dc29fa\worker_multiple_1791577461565.jpg",
    r"C:\Users\soumy\.gemini\antigravity-ide\brain\0e7434ca-b021-4c85-b18b-f3d5e5dc29fa\worker_out_of_frame_1791577472234.jpg"
]

output_path = r"C:\Users\soumy\OneDrive\Desktop\BPUT-FSTS\jury_test_video.avi"
fps = 30
duration_per_image = 4  # seconds

print("Creating test video for jury presentation...")

# Read first image to get dimensions
frame = cv2.imread(images[0])
height, width, layers = frame.shape

fourcc = cv2.VideoWriter_fourcc(*'XVID')
video = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

for img_path in images:
    img = cv2.imread(img_path)
    if img is not None:
        print(f"Adding {os.path.basename(img_path)}...")
        # Resize to match first image dimensions if needed
        img = cv2.resize(img, (width, height))
        
        # Add text label for clarity
        if "perfect" in img_path:
            text = "SCENARIO: FULLY EQUIPPED (100%)"
        elif "hardhat" in img_path:
            text = "SCENARIO: MISSING HARDHAT (<100%)"
        elif "gloves" in img_path:
            text = "SCENARIO: MISSING GLOVES (<100%)"
        elif "multiple" in img_path:
            text = "SCENARIO: MULTIPLE PEOPLE (ERROR)"
        else:
            text = "SCENARIO: OUT OF FRAME (ERROR)"
            
        cv2.putText(img, text, (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 4)
        cv2.putText(img, text, (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        # Write same frame multiple times to create a static video clip
        for _ in range(fps * duration_per_image):
            video.write(img)
    else:
        print(f"Warning: Could not read {img_path}")

video.release()
print(f"Video created successfully at: {output_path}")
