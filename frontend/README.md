# Frontend

## Frontend Development

Run the development server from the `frontend` directory:

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

## Environment Variables

Create a `.env.local` file from `.env.example` when you need to override local service URLs.

```env
NEXT_PUBLIC_GATEWAY_URL=http://localhost
NEXT_PUBLIC_USER_SERVICE_URL=http://localhost:5000
NEXT_PUBLIC_CHAT_SERVICE_URL=http://localhost:5002
NEXT_PUBLIC_WEBRTC_ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302"]}]
```

`NEXT_PUBLIC_WEBRTC_ICE_SERVERS` is a JSON array passed directly to `RTCPeerConnection`. For local development, a public STUN server is enough. For production, replace this with TURN-capable ICE servers.

## Features Wired In The Frontend

- Real-time chat and presence through Socket.IO
- Image messaging with preview before upload
- Global incoming video call popup while the app is open
- 1:1 video call overlay with mute and camera toggle
- Call summary messages rendered inside the chat timeline
