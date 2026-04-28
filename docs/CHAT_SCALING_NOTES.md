# Chat Service Scaling Notes

These notes cover the P2 scalability checks for running more than one
`chat-service` replica behind the gateway.

## Socket.IO Cross-Replica Verification

Run the stack with at least two chat replicas and the Redis adapter enabled:

```bash
docker compose up --build --scale chat-service=2
```

Verify these flows with two browser sessions connected as different users:

- Online presence: connect user A and user B, then refresh one browser. Both
  clients should receive `getOnlineUser` with the same online user IDs. Presence
  is stored in Redis under `chat:presence:*` keys and stale sockets are pruned by
  TTL-backed socket ownership keys.
- Rooms: open the same chat from both users. `joinChat` joins the Socket.IO room
  on whichever replica owns the socket, and Redis adapter propagates room emits.
- Typing: typing in one browser emits `userTyping` to the chat room. The other
  browser should receive the event even when the clients are connected to
  different chat replicas.
- Messages: sending a message emits `newMessage` to the chat room and to user
  rooms. Both sender and receiver should receive one message update.
- Read receipts: when a receiver opens a chat, `messagesSeen` should reach the
  sender. The service uses `io.in(chatId).fetchSockets()` so room membership is
  checked across replicas through the Redis adapter.
- Calls: initiating, accepting, declining, ending, and WebRTC signal events are
  emitted to per-user rooms. Signal participant lookup is cached in Redis under
  `chat:call:{callId}:participants`, with MongoDB as the source of truth.

## Memory State Review

- Presence and user-to-socket mapping are stored in Redis, not a process-local
  map.
- Call signal participant cache is stored in Redis with a one-day TTL and is
  evicted when calls end.
- `callTimeouts` in `src/call/timeouts.ts` stores process-local timer handles,
  not source-of-truth call state. MongoDB guards call state transitions with
  expected status checks, so a timeout firing on another replica after a call was
  accepted or ended is a no-op. Startup cleanup also resolves stale ringing calls.
- Request-local maps in controllers are temporary per-request indexes and do not
  represent cross-instance state.

If exact distributed call timeout ownership becomes required, move missed-call
scheduling to a shared delayed job mechanism such as RabbitMQ delayed messages,
Redis sorted sets with a scheduler, or a workflow engine.

## Load-Test Notes

Recommended baseline test:

- Start `docker compose up --build --scale chat-service=2`.
- Use a Socket.IO client load script or k6 WebSocket script to create batches of
  authenticated socket connections.
- Ramp from 100 to 1,000 concurrent sockets, then hold for 10 minutes.
- During the hold, emit `joinChat`, `typing`, `stopTyping`, and message-send HTTP
  requests for active rooms.
- Track gateway p95/p99 latency, chat-service CPU and memory, Redis CPU/memory,
  Redis command latency, MongoDB write latency, and Socket.IO reconnect/error
  rates.
- Repeat with 2, 3, and 4 chat replicas to check whether message throughput and
  connection count scale linearly enough for the expected deployment size.

Record the tested commit, machine size, replica count, concurrent socket count,
message rate, and observed bottleneck before using the result for capacity
planning.
