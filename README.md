# Real-Time Chat Microservices

Ứng dụng chat real-time theo kiến trúc microservices, gồm frontend Next.js, Nginx gateway, 3 backend services và RabbitMQ làm message broker.

## Tổng quan kiến trúc

### Các service chính

| Service      | Port | Vai trò                                                        |
| ------------ | ---- | -------------------------------------------------------------- |
| frontend     | 3000 | Giao diện người dùng, gọi API qua gateway và kết nối Socket.IO |
| gateway      | 80   | Nginx reverse proxy cho các route backend và Socket.IO         |
| user-service | 5000 | Đăng nhập OTP, xác thực OTP, phát JWT, profile, danh sách user |
| chat-service | 5002 | Chat 1-1, lịch sử tin nhắn, upload ảnh, realtime qua Socket.IO |
| mail-service | 5001 | Consumer RabbitMQ để gửi email OTP                             |

### Hạ tầng đi kèm

| Service  | Port        | Vai trò                                        |
| -------- | ----------- | ---------------------------------------------- |
| rabbitmq | 5672, 15672 | Message broker cho `send-otp` và `user.events` |

### Các kiểu giao tiếp trong hệ thống

- `frontend -> gateway -> user-service/chat-service`: REST qua HTTP
- `frontend -> gateway -> chat-service`: Socket.IO / WebSocket
- `user-service -> rabbitmq -> mail-service`: message queue bất đồng bộ qua `send-otp`
- `user-service -> rabbitmq -> chat-service`: message queue bất đồng bộ qua `user.events`

Hiện tại code không dùng gRPC. Chat service cũng không còn gọi trực tiếp user service bằng HTTP; dữ liệu user được đồng bộ bất đồng bộ qua RabbitMQ.

## Sơ đồ luồng request

```text
┌──────────────────────┐
│ Trình duyệt          │
└──────────┬───────────┘
           │
           │ HTTP / Socket.IO
           ▼
┌──────────────────────┐
│ Frontend (Next.js)   │
│ Port 3000            │
└──────────┬───────────┘
           │
           │ Gọi API qua gateway
           ▼
┌──────────────────────┐
│ Nginx Gateway        │
│ Port 80              │
└───────┬────────┬─────┘
        │        │
        │        │
        ▼        ▼
┌──────────────┐  ┌──────────────────┐
│ User Service │  │ Chat Service     │
│ Port 5000    │  │ Port 5002        │
└─────┬────────┘  └──────┬───────────┘
      │                  │
      │                  ├──────────────► MongoDB
      │                  ├──────────────► Redis
      │                  │                - Socket.IO adapter
      │                  │                - Online user mapping
      │                  └──────────────► Cloudinary
      │
      ├──────────────────► MongoDB
      ├──────────────────► Redis
      │                    - OTP TTL
      │                    - Rate limit
      │
      ├──────────────────► RabbitMQ queue: send-otp
      │                                      │
      │                                      ▼
      │                         ┌──────────────────────┐
      │                         │ Mail Service         │
      │                         │ Port 5001            │
      │                         └──────────┬───────────┘
      │                                    │
      │                                    ▼
      │                               SMTP / Gmail
      │
      └──────────────────► RabbitMQ queue: user.events
                                             │
                                             ▼
                                   Chat Service consumer
                                             │
                                             ▼
                                   Đồng bộ UserSnapshot
```

## Auth hoạt động như thế nào

Auth được xử lý ở tầng application, không nằm ở gateway.

1. Frontend gọi `POST /api/v1/login` vào user service.
2. User service tạo OTP, lưu vào Redis với TTL 5 phút, đồng thời đặt rate-limit 60 giây.
3. User service publish message vào queue `send-otp`.
4. Mail service consume queue và gửi email OTP.
5. Frontend gọi `POST /api/v1/verify`.
6. User service verify OTP, tạo user nếu chưa tồn tại, sau đó ký JWT bằng `JWT_PRIVATE_KEY` theo thuật toán `RS256`.
7. Frontend gửi JWT ở header `Authorization: Bearer <token>` cho các request cần đăng nhập.
8. User service và chat service đều tự verify JWT bằng `JWT_PUBLIC_KEY` trong middleware riêng.

## Dữ liệu và storage của từng service

| Service      | Storage                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| user-service | MongoDB cho dữ liệu user, Redis cho OTP và rate limit                                                           |
| chat-service | MongoDB cho chats, messages, user snapshots; Redis cho Socket.IO adapter và online presence; Cloudinary cho ảnh |
| mail-service | Không có database riêng                                                                                         |
| frontend     | Không có database                                                                                               |
| gateway      | Không có database                                                                                               |

Hiện tại project da ho tro pattern database-per-service theo bien moi truong:

- `user-service` dung `MONGO_DB_NAME=chat_user_service`
- `chat-service` dung `MONGO_DB_NAME=chat_chat_service`

Hai service co the van dung chung mot MongoDB server, nhung nen tach database logical de ro ownership du lieu. `UserSnapshot` trong chat service la ban sao dong bo qua RabbitMQ, khong phai source of truth cua user.

## Cấu trúc thư mục

```text
.
├── backend
│   ├── user
│   ├── mail
│   └── chat
├── frontend
├── docker-compose.yml
├── nginx.conf
└── scripts
    └── generate-keys.mjs
```

## API chính

### User service

| Method | Path                  | Mô tả                              |
| ------ | --------------------- | ---------------------------------- |
| POST   | `/api/v1/login`       | Gửi OTP tới email                  |
| POST   | `/api/v1/verify`      | Xác thực OTP, trả về token và user |
| GET    | `/api/v1/me`          | Lấy profile hiện tại               |
| GET    | `/api/v1/user/all`    | Lấy danh sách user                 |
| GET    | `/api/v1/user/:id`    | Lấy thông tin một user             |
| POST   | `/api/v1/update/user` | Cập nhật display name              |

### Chat service

| Method | Path                      | Mô tả                                    |
| ------ | ------------------------- | ---------------------------------------- |
| POST   | `/api/v1/chat/new`        | Tạo hoặc lấy chat 1-1                    |
| GET    | `/api/v1/chat/all`        | Lấy danh sách chat và unseen count       |
| POST   | `/api/v1/message`         | Gửi text hoặc image message              |
| GET    | `/api/v1/message/:chatId` | Lấy message theo chat và đánh dấu đã xem |

### Health check

- `GET /health` trên user service
- `GET /health` trên chat service
- `GET /health` trên mail service

## Gateway routes

Nginx gateway forward các route sau:

- User service: `/api/v1/login`, `/api/v1/verify`, `/api/v1/me`, `/api/v1/update`, `/api/v1/user`
- Chat service: `/api/v1/chat`, `/api/v1/message`, `/api/v1/call`, `/socket.io/`

Frontend mặc định gọi gateway qua `NEXT_PUBLIC_GATEWAY_URL`, fallback về `http://localhost:80`.

## Biến môi trường

### backend/user/.env

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/chat_app
MONGO_DB_NAME=chat_user_service
REDIS_URL=redis://localhost:6379
JWT_PRIVATE_KEY=<run: node scripts/generate-keys.mjs>
JWT_PUBLIC_KEY=<run: node scripts/generate-keys.mjs>
Rabbitmq_Host=localhost
Rabbitmq_Username=guest
Rabbitmq_Password=guest
# CORS — mặc định localhost:3000. Production: đặt domain thật (phân cách bằng dấu phẩy nếu nhiều origin)
# CORS_ORIGIN=https://yourdomain.com
```

### backend/chat/.env

```env
PORT=5002
REDIS_URL=redis://localhost:6379
MONGO_URI=mongodb://localhost:27017/chat_app
MONGO_DB_NAME=chat_chat_service
USER_SERVICE=http://localhost:5000
JWT_PUBLIC_KEY=<run: node scripts/generate-keys.mjs>
Rabbitmq_Host=localhost
Rabbitmq_Username=guest
Rabbitmq_Password=guest
CLOUD_NAME=your_cloudinary_cloud_name
API_KEY=your_cloudinary_api_key
API_SECRET=your_cloudinary_api_secret
# CORS — mặc định localhost:3000. Production: đặt domain thật (phân cách bằng dấu phẩy nếu nhiều origin)
# CORS_ORIGIN=https://yourdomain.com
```

### backend/mail/.env

```env
PORT=5001
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
Rabbitmq_Host=localhost
Rabbitmq_Username=guest
Rabbitmq_Password=guest
```

### frontend/.env.local

```env
NEXT_PUBLIC_USER_SERVICE_URL=http://localhost:5000
NEXT_PUBLIC_CHAT_SERVICE_URL=http://localhost:5002
```

Neu chay qua nginx gateway thay vi goi truc tiep tung service, dat:

```env
NEXT_PUBLIC_GATEWAY_URL=http://localhost:80
```

## Chạy bằng Docker Compose

```bash
docker compose up --build
```

Sau khi chạy:

- Frontend: `http://localhost:3000`
- Gateway: `http://localhost:80`
- User service: `http://localhost:5000`
- Chat service: `http://localhost:5002`
- RabbitMQ management: `http://localhost:15672`

`mail-service` không cần expose port ra ngoài để frontend dùng, nhưng compose hiện vẫn khởi động service này để consume queue.

## Chạy local từng service

### 1. Cài dependencies

```bash
cd backend/user && npm install
cd ../mail && npm install
cd ../chat && npm install
cd ../../frontend && npm install
```

### 2. Tạo JWT key pair

```bash
node scripts/generate-keys.mjs
```

Copy public/private key vào file `.env` tương ứng của `backend/user` và `backend/chat`.

### 2.1. Chon database logical cho tung service

Neu ban dung chung mot MongoDB server cho ca 2 service, hay giu cung `MONGO_URI` nhung tach `MONGO_DB_NAME`:

```env
# backend/user/.env
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=chat_user_service

# backend/chat/.env
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=chat_chat_service
```

Hoac neu ban muon, van co the giu path trong `MONGO_URI`; service se uu tien `MONGO_DB_NAME` de dat ten database can ket noi.

### 3. Chạy từng service

```bash
cd backend/user && npm run dev
cd backend/mail && npm run dev
cd backend/chat && npm run dev
cd frontend && npm run dev
```

## Luồng realtime

1. Frontend kết nối Socket.IO vào gateway.
2. Gateway proxy `/socket.io/` sang chat service.
3. Chat service lưu `socket:user:<userId> -> socketId` trong Redis.
4. Khi user gửi message, chat service lưu MongoDB, emit `newMessage`, và cập nhật trạng thái seen nếu người nhận đang ở trong room chat.

## Ghi chú phát triển

- Backend dùng TypeScript với `type: module`.
- Import trong backend dùng hậu tố `.js` theo ESM / NodeNext.
- Backend có test suite dùng Vitest (xem `backend/user/tests` và `backend/chat/tests`).
- `mail-service` là worker, không phải public API service.
- Upload ảnh dùng `multer` + `multer-storage-cloudinary`, giới hạn 5MB.

## Các file nên đọc đầu tiên

- `docker-compose.yml`: toàn bộ topology khi chạy bằng container
- `nginx.conf`: routing của gateway
- `backend/user/src/controller/user.ts`: login, verify, publish events
- `backend/chat/src/controller/chat.ts`: chat/message flow
- `backend/chat/src/config/socket.ts`: realtime logic
- `backend/chat/src/config/rabbitmq.ts`: consumer đồng bộ user snapshot
- `backend/mail/src/consumer.ts`: gửi OTP từ queue
- `frontend/src/context/AppContext.tsx`: client API wiring
