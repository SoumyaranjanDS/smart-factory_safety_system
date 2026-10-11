import { useState, useEffect, useRef, useCallback } from "react";
import zegoService from "../services/zegoService";

export type StreamStatus = "ONLINE" | "CONNECTING" | "OFFLINE";

export function useZegoRoom(
  appID: number,
  serverURL: string,
  roomID: string,
  token: string,
) {
  const [streamStates, setStreamStates] = useState<
    Record<string, StreamStatus>
  >({});
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [roomStatus, setRoomStatus] = useState<
    "DISCONNECTED" | "CONNECTING" | "CONNECTED"
  >("DISCONNECTED");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [debugLog, setDebugLog] = useState<string>("init");
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!appID || !serverURL) return;

    let isMounted = true;
    zegoService.initEngine(appID, serverURL);

    const handleRoomStateUpdate = (roomID: string, state: string) => {
      if (state === "DISCONNECTED") setRoomStatus("DISCONNECTED");
      else if (state === "CONNECTING") setRoomStatus("CONNECTING");
      else if (state === "CONNECTED") setRoomStatus("CONNECTED");
    };

    const handleRoomStreamUpdate = async (
      roomID: string,
      updateType: "ADD" | "DELETE",
      streamList: any[],
    ) => {
      if (updateType === "ADD") {
        for (const streamInfo of streamList) {
          setStreamStates((prev) => ({
            ...prev,
            [streamInfo.streamID]: "CONNECTING",
          }));
          try {
            const remoteStream = await zegoService.startPlayingStream(
              streamInfo.streamID,
            );
            if (isMounted) {
              setStreams((prev) => ({
                ...prev,
                [streamInfo.streamID]: remoteStream,
              }));
              setStreamStates((prev) => ({
                ...prev,
                [streamInfo.streamID]: "ONLINE",
              }));
            }
          } catch (err) {
            console.error("Error playing stream:", err);
            if (isMounted)
              setStreamStates((prev) => ({
                ...prev,
                [streamInfo.streamID]: "OFFLINE",
              }));
          }
        }
      } else if (updateType === "DELETE") {
        for (const streamInfo of streamList) {
          zegoService.stopPlayingStream(streamInfo.streamID);
          if (isMounted) {
            setStreams((prev) => {
              const newStreams = { ...prev };
              delete newStreams[streamInfo.streamID];
              return newStreams;
            });
            setStreamStates((prev) => ({
              ...prev,
              [streamInfo.streamID]: "OFFLINE",
            }));
          }
        }
      }
    };

    const handlePlayerStateUpdate = (streamID: string, state: string) => {
      if (state === "PLAYING") {
        setStreamStates((prev) => ({ ...prev, [streamID]: "ONLINE" }));
      }
    };

    zegoService.on("roomStateUpdate", handleRoomStateUpdate);
    zegoService.on("roomStreamUpdate", handleRoomStreamUpdate);
    zegoService.on("playerStateUpdate", handlePlayerStateUpdate);

    const baseUserId = import.meta.env.VITE_ZEGO_USER_ID || "test_user";
    const userID = `${baseUserId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const connect = async () => {
      setRoomStatus("CONNECTING");
      setDebugLog("connect() called");
      try {
        let activeToken = token; 
        
        try {
          setDebugLog("fetching dynamic token...");
          const response = await fetch(`/api/zego-token?userId=${userID}&roomId=${roomID}&t=${Date.now()}`);
          if (response.ok) {
            const data = await response.json();
            if (data.token) activeToken = data.token;
            setDebugLog("dynamic token fetched");
          } else {
            console.warn("Backend dynamic token failed (missing secret?), using static token.");
            setDebugLog(`fetch failed: ${response.status}`);
          }
        } catch (err: any) {
          console.warn("API unreachable, using static token.", err);
          setDebugLog(`fetch error: ${err.message}`);
        }

        setDebugLog("calling loginRoom...");
        await zegoService.loginRoom(roomID, activeToken, {
          userID,
          userName: userID,
        });
        setDebugLog("loginRoom success");
        if (isMounted) {
            setRoomStatus("CONNECTED");
            setErrorMsg("");
        }
      } catch (err: any) {
        console.error("Zego login failed", err);
        if (isMounted) {
            setRoomStatus("DISCONNECTED");
            setErrorMsg(err?.message || JSON.stringify(err) || "Unknown login error");
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      zegoService.off("roomStateUpdate", handleRoomStateUpdate);
      zegoService.off("roomStreamUpdate", handleRoomStreamUpdate);
      zegoService.off("playerStateUpdate", handlePlayerStateUpdate);

      if (localStreamRef.current) {
        zegoService.destroyStream(localStreamRef.current);
      }
      Object.keys(streams).forEach((streamId) => {
        zegoService.stopPlayingStream(streamId);
      });
      zegoService.logoutRoom(roomID);
      zegoService.destroy();
    };
  }, [appID, serverURL, roomID, token]);

  const togglePublish = useCallback(
    async (streamID = "camera_01") => {
      if (roomStatus !== "CONNECTED") {
        console.warn("Cannot publish: Not connected to the room.");
        alert("Waiting for room connection to establish before publishing.");
        return;
      }

      if (isPublishing) {
        await zegoService.stopPublishingStream(streamID);
        if (localStreamRef.current) {
          zegoService.destroyStream(localStreamRef.current);
          localStreamRef.current = null;
        }
        setStreams((prev) => {
          const newStreams = { ...prev };
          delete newStreams[streamID];
          return newStreams;
        });
        setStreamStates((prev) => ({ ...prev, [streamID]: "OFFLINE" }));
        setIsPublishing(false);
      } else {
        try {
          const localStream = await zegoService.createLocalStream({
            camera: { 
              video: true, 
              audio: false, 
              facingMode: "environment" 
            } as any,
          });
          localStreamRef.current = localStream;
          await zegoService.startPublishingStream(streamID, localStream);

          setStreams((prev) => ({ ...prev, [streamID]: localStream }));
          setStreamStates((prev) => ({ ...prev, [streamID]: "ONLINE" }));
          setIsPublishing(true);
        } catch (err) {
          console.error("Publish error", err);
        }
      }
    },
    [isPublishing, roomStatus],
  );

  return {
    roomStatus,
    errorMsg,
    debugLog,
    streams,
    streamStates,
    isPublishing,
    togglePublish,
  };
}
