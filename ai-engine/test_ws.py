import asyncio
import websockets
import base64
import cv2
import numpy as np
import json

async def test():
    try:
        async with websockets.connect('ws://localhost:8000/ws/stream/Test_1234') as ws:
            # Send a blank image
            img = np.zeros((320, 320, 3), dtype=np.uint8)
            _, encoded = cv2.imencode('.jpg', img)
            b64_str = base64.b64encode(encoded).decode('utf-8')
            
            await ws.send("data:image/jpeg;base64," + b64_str)
            print("sent frame")
            
            res = await asyncio.wait_for(ws.recv(), timeout=5.0)
            print("received:", res)
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
