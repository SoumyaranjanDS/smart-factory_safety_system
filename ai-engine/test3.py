import asyncio
import websockets
import base64
import cv2
import json

async def test():
    async with websockets.connect('ws://localhost:8000/ws/stream/Test_1234') as ws:
        cap = cv2.VideoCapture(r'c:\Users\soumy\OneDrive\Desktop\BPUT-FSTS\factory.mp4')
        ret, frame = cap.read()
        cap.release()
        
        _, encoded = cv2.imencode('.jpg', frame)
        b64_str = base64.b64encode(encoded).decode()
        
        await ws.send("data:image/jpeg;base64," + b64_str)
        
        res = await asyncio.wait_for(ws.recv(), timeout=5.0)
        with open('ws_output.txt', 'w', encoding='utf-8') as f:
            f.write(res)

asyncio.run(test())
