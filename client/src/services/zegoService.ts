import { ZegoExpressEngine } from 'zego-express-engine-webrtc';

class ZegoService {
    public engine: ZegoExpressEngine | null = null;
    
    initEngine(appID: number, serverURL: string) {
        if (!this.engine) {
            this.engine = new ZegoExpressEngine(appID, serverURL);
        }
        return this.engine;
    }

    async loginRoom(roomID: string, token: string, user: {userID: string, userName: string}) {
        if (!this.engine) throw new Error("Engine not initialized");
        await this.engine.loginRoom(roomID, token, user, { userUpdate: true });
    }

    async logoutRoom(roomID: string) {
        if (!this.engine) return;
        this.engine.logoutRoom(roomID);
    }

    async startPlayingStream(streamId: string): Promise<MediaStream> {
        if (!this.engine) throw new Error("Engine not initialized");
        return await this.engine.startPlayingStream(streamId);
    }

    async stopPlayingStream(streamId: string) {
        if (!this.engine) return;
        await this.engine.stopPlayingStream(streamId);
    }

    async createLocalStream(options = { camera: { video: true, audio: false } }): Promise<MediaStream> {
        if (!this.engine) throw new Error("Engine not initialized");
        return await this.engine.createStream(options);
    }

    async startPublishingStream(streamId: string, mediaStream: MediaStream) {
        if (!this.engine) throw new Error("Engine not initialized");
        await this.engine.startPublishingStream(streamId, mediaStream);
    }

    async stopPublishingStream(streamId: string) {
        if (!this.engine) return;
        this.engine.stopPublishingStream(streamId);
    }
    
    destroyStream(mediaStream: MediaStream) {
        if (!this.engine) return;
        this.engine.destroyStream(mediaStream);
    }

    on(event: string, callback: (...args: any[]) => void) {
        if (!this.engine) return;
        this.engine.on(event as any, callback);
    }
    
    off(event: string, callback: (...args: any[]) => void) {
        if (!this.engine) return;
        this.engine.off(event as any, callback);
    }
    
    destroy() {
        if (this.engine) {
            this.engine.destroyEngine();
            this.engine = null;
        }
    }
}

const zegoService = new ZegoService();
export default zegoService;
