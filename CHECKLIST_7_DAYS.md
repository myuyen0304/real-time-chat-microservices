# 7-Day Microservice Improvement Checklist

Danh sách kiểm tra này được biên soạn nhằm cải tiến kho mã nguồn theo hai mục tiêu song song: phù hợp với hồ sơ ứng tuyển vị trí Fresher/Junior và tiến gần hơn tới kiến trúc microservice thực tế. Checklist ưu tiên các hạng mục có tác động rõ ràng tới ranh giới dịch vụ (service boundaries), kiểm xác thực dữ liệu (validation), xác thực người dùng (authentication), giao tiếp bất đồng bộ, kiểm thử (testing), tích hợp liên tục (CI), khả năng vận hành (operability), trải nghiệm người dùng (UX) và triển khai bằng container.

## Hướng Dẫn Sử Dụng

- [ ] Đánh dấu từng tác vụ khi hoàn thành.
- [ ] Ưu tiên thực hiện theo thứ tự từ Ngày 1 đến Ngày 7.
- [ ] Trong trường hợp thời gian hạn chế, vui lòng ưu tiên hoàn thành Ngày 1, Ngày 3, Ngày 5 và Ngày 7.
- [ ] Với mỗi ngày, ưu tiên sửa tận gốc nguyên nhân kiến trúc trước khi tinh chỉnh bề mặt.

## Ngày 1: Kiểm Xác Thực Dữ Liệu Và Hợp Đồng API (Validation & API Contracts)

**Mục tiêu:** API có giao diện rõ ràng, phản hồi nhất quán, dễ kiểm thử, dễ trình diễn và không làm rò rỉ chi tiết triển khai nội bộ.

- [ ] Bổ sung kiểm xác thực yêu cầu cho đăng nhập, xác thực OTP, cập nhật thông tin người dùng.
- [ ] Bổ sung kiểm xác thực yêu cầu cho tạo cuộc trò chuyện, gửi tin nhắn.
- [ ] Chuẩn hóa phản hồi lỗi cho dữ liệu đầu vào sai thành mã `400` hoặc `422`.
- [ ] Chuẩn hóa phản hồi lỗi xác thực thành mã `401` hoặc `403`.
- [ ] Chặn email không hợp lệ trước khi tạo OTP.
- [ ] Chặn OTP rỗng, sai độ dài hoặc sai định dạng.
- [ ] Chặn tên rỗng, quá ngắn hoặc quá dài.
- [ ] Tạo middleware `validateRequest` để tái sử dụng.
- [ ] Thống nhất định dạng phản hồi thành công và lỗi giữa user service và chat service.
- [ ] Tạo tài liệu ngắn mô tả request/response cho các API cốt lõi.

**Tệp ưu tiên:**

- `backend/user/src/controller/user.ts`
- `backend/user/src/routes/user.ts`
- `backend/chat/src/controller/chat.ts`
- `backend/chat/src/routes/chat.ts`
- `README.md`

**Tiêu chí hoàn thành:**

- Tất cả API chính đều kiểm xác thực dữ liệu đầu vào.
- Không còn trả mã `500` cho các lỗi đầu vào thông thường.
- Người đọc có thể đoán được contract API mà không cần soi sâu vào controller.

## Ngày 2: Xác Thực Người Dùng, Socket Và Quản Lý Secret (Auth, Socket & Secrets)

**Mục tiêu:** Quy trình xác thực an toàn hơn, nhất quán hơn giữa các service và dễ giải thích khi phỏng vấn.

- [x] Rà soát middleware xác thực JWT của dịch vụ người dùng.
- [x] Rà soát middleware xác thực JWT của dịch vụ trò chuyện.
- [x] Kiểm tra trường hợp token rỗng, sai định dạng hoặc hết hạn.
- [x] Tách phần giới hạn tần suất OTP thành một hàm tiện ích riêng.
- [x] Chặn yêu cầu OTP lặp lại (spam) với email không hợp lệ.
- [x] Xác thực Socket bằng JWT thay vì chỉ sử dụng `userId` qua tham số truy vấn.
- [x] Thêm kiểm tra `issuer`, `audience` hoặc cấu trúc claim cơ bản cho JWT nếu phù hợp.
- [x] Tạo bước kiểm tra biến môi trường bắt buộc khi service khởi động.
- [x] Bổ sung `.env.example` cho từng service và loại bỏ placeholder mơ hồ.
- [x] Rà soát và thay toàn bộ secret hardcode hoặc secret dễ bị lộ trong tài liệu.

**Tệp ưu tiên:**

- `backend/user/src/middlewares/isAuth.ts`
- `backend/chat/src/middleware/isAuth.ts`
- `backend/user/src/controller/user.ts`
- `backend/chat/src/config/socket.ts`
- `backend/user/.env.example`
- `backend/chat/.env.example`
- `backend/mail/.env.example`

**Tiêu chí hoàn thành:**

- Các tuyến đường được bảo vệ có hành vi xác thực nhất quán.
- Điểm cuối OTP không xử lý các yêu cầu không hợp lệ.
- Chat service không còn tin tưởng mù quáng vào `userId` gửi từ client khi kết nối Socket.
- Service fail fast khi thiếu biến môi trường quan trọng.

## Ngày 3: Kiểm Thử Dịch Vụ Người Dùng Và Hợp Đồng Sự Kiện

**Mục tiêu:** Có bộ kiểm thử cho quy trình xác thực quan trọng nhất và không phá vỡ hợp đồng publish event.

- [x] Lựa chọn framework kiểm thử cho backend, ưu tiên Vitest hoặc Jest.
- [x] Bổ sung kiểm thử cho trường hợp đăng nhập gửi OTP thành công.
- [x] Bổ sung kiểm thử cho trường hợp đăng nhập bị giới hạn tần suất khi spam.
- [x] Bổ sung kiểm thử cho trường hợp xác thực OTP chính xác.
- [x] Bổ sung kiểm thử cho trường hợp xác thực OTP sai hoặc hết hạn.
- [x] Nếu còn thời gian, bổ sung kiểm thử cho tuyến đường `/me`.
- [x] Nếu còn thời gian, bổ sung kiểm thử cho cập nhật thông tin người dùng.
- [x] Cập nhật kịch bản kiểm thử trong `package.json`.
- [x] Bổ sung kiểm thử cho việc publish `send-otp` và `user.events`.
- [x] Tạo mock hoặc fake cho Redis và RabbitMQ để kiểm thử ổn định hơn.

**Tệp ưu tiên:**

- `backend/user/package.json`
- `backend/user/src/index.ts`
- `backend/user/src/controller/user.ts`
- `backend/user/src/config/rabbitmq.ts`

**Tiêu chí hoàn thành:**

- Có thể chạy kiểm thử dịch vụ người dùng bằng một lệnh rõ ràng.
- Không còn kịch bản kiểm thử tạm thời (placeholder).
- Việc thay đổi logic đăng nhập không vô tình làm vỡ event contract hiện có.

## Ngày 4: Kiểm Thử Dịch Vụ Trò Chuyện Và Ranh Giới Dữ Liệu

**Mục tiêu:** Có bộ kiểm thử cho luồng trò chuyện và nhắn tin cơ bản, đồng thời đảm bảo chat service chỉ phụ thuộc vào dữ liệu nó sở hữu hoặc dữ liệu đã đồng bộ.

- [x] Bổ sung kiểm thử cho tạo cuộc trò chuyện.
- [x] Bổ sung kiểm thử cho trường hợp tạo cuộc trò chuyện khi nó đã tồn tại.
- [x] Bổ sung kiểm thử cho gửi tin nhắn văn bản.
- [x] Bổ sung kiểm thử cho truy xuất tin nhắn theo cuộc trò chuyện.
- [x] Bổ sung kiểm thử chặn người dùng ngoài cuộc trò chuyện truy cập tin nhắn.
- [x] Nếu còn thời gian, bổ sung kiểm thử cho luồng trạng thái đã xem/chưa xem.
- [x] Bổ sung kiểm thử cho dữ liệu `UserSnapshot` khi nhận event `user.upserted`.
- [x] Kiểm tra xem chat service có đọc chéo dữ liệu user service hay không, và loại bỏ nếu có.

**Tệp ưu tiên:**

- `backend/chat/package.json`
- `backend/chat/src/controller/chat.ts`
- `backend/chat/src/routes/chat.ts`
- `backend/chat/src/config/rabbitmq.ts`
- `backend/chat/src/model/UserSnapshot.ts`

**Tiêu chí hoàn thành:**

- Dịch vụ trò chuyện có bộ kiểm thử cho các API cốt lõi.
- Chat service thể hiện rõ mô hình local read model thay vì phụ thuộc trực tiếp service khác.

## Ngày 5: Quy Trình CI, Chất Lượng Mã Nguồn Và Cổng Chặn Hồi Quy

**Mục tiêu:** Mọi thay đổi đều được kiểm tra tự động trước khi merge, giảm rủi ro hồi quy giữa các service.

- [ ] Tạo quy trình GitHub Actions chạy khi push và pull request.
- [ ] Cài đặt các gói phụ thuộc cho từng dịch vụ trong quy trình.
- [ ] Chạy bản dựng cho dịch vụ người dùng.
- [ ] Chạy bản dựng cho dịch vụ email.
- [ ] Chạy bản dựng cho dịch vụ trò chuyện.
- [ ] Chạy kiểm tra cú pháp (lint) cho frontend.
- [ ] Chạy bản dựng cho frontend.
- [ ] Chạy kiểm thử dịch vụ người dùng.
- [ ] Chạy kiểm thử dịch vụ trò chuyện.
- [ ] Nếu có thể, thêm job riêng cho smoke test API cốt lõi.
- [ ] Nếu có thể, thêm cache dependency để CI ổn định và nhanh hơn.

**Tệp ưu tiên:**

- `.github/workflows/ci.yml`
- `backend/user/package.json`
- `backend/chat/package.json`
- `backend/mail/package.json`
- `frontend/package.json`

**Tiêu chí hoàn thành:**

- Kho mã nguồn có quy trình CI cơ bản cho bản dựng, kiểm tra cú pháp và kiểm thử.
- PR mới có thể bị chặn nếu làm hỏng build hoặc test của service khác.

## Ngày 6: Thời Gian Thực, Trạng Thái Dùng Chung Và Quan Sát Hệ Thống

**Mục tiêu:** Ứng dụng demo mượt mà hơn và hệ thống realtime bớt phụ thuộc vào state trong memory của một process duy nhất.

- [ ] Bổ sung trạng thái tải cho màn hình trò chuyện.
- [ ] Bổ sung trạng thái trống khi chưa có cuộc trò chuyện nào.
- [ ] Bổ sung trạng thái lỗi rõ ràng khi tải thất bại.
- [ ] Bổ sung xử lý kết nối lại cho Socket.
- [ ] Hiển thị trạng thái ngắt kết nối nếu mất liên lạc.
- [ ] Bổ sung tính năng tự động cuộn xuống tin nhắn mới.
- [ ] Nếu có tính năng gửi ảnh, bổ sung xem trước ảnh trước khi gửi.
- [ ] Kiểm tra tính tương thích giao diện (responsive) cho thiết bị di động.
- [ ] Chuyển dần online presence và socket mapping sang Redis thay vì giữ chủ yếu trong memory.
- [ ] Bổ sung log có cấu trúc cho event quan trọng: login, verify OTP, create chat, send message, consume event.
- [ ] Nếu còn thời gian, thêm request id hoặc correlation id xuyên qua gateway và backend.

**Tệp ưu tiên:**

- `frontend/src/app/chat/page.tsx`
- `frontend/src/context/SocketContext.tsx`
- `frontend/src/context/AppContext.tsx`
- `frontend/src/components/MessageInput.tsx`
- `backend/chat/src/config/socket.ts`
- `backend/user/src/index.ts`
- `backend/chat/src/index.ts`
- `backend/mail/src/index.ts`

**Tiêu chí hoàn thành:**

- Bản demo trò chuyện ổn định hơn, trải nghiệm người dùng dễ theo dõi hơn.
- Nếu mở rộng nhiều instance chat service, logic realtime không phụ thuộc hoàn toàn vào memory cục bộ.

## Ngày 7: Docker, Hạ Tầng Cục Bộ, Gateway Và Tài Liệu Vận Hành

**Mục tiêu:** Dự án dễ sao chép, dễ khởi chạy, dễ đưa vào hồ sơ ứng tuyển và thể hiện được tư duy triển khai microservice gần thực tế hơn.

- [ ] Bổ sung MongoDB vào `docker-compose.yml` để có thể chạy đủ môi trường cục bộ.
- [ ] Bổ sung Redis vào `docker-compose.yml` để có thể chạy đủ môi trường cục bộ.
- [ ] Bổ sung volume dữ liệu cho MongoDB và Redis nếu phù hợp.
- [ ] Bổ sung kiểm tra trạng thái hoạt động (healthcheck) cho các dịch vụ còn thiếu nếu cần thiết.
- [ ] Kiểm tra các tuyến đường gateway trong `nginx.conf`.
- [ ] Đồng bộ lại biến môi trường và hướng dẫn khởi chạy giữa README và mã nguồn.
- [ ] Bổ sung mục Kiểm thử trong README.
- [ ] Bổ sung mục CI trong README.
- [ ] Bổ sung mục kiến trúc nêu rõ service nào sở hữu dữ liệu nào.
- [ ] Bổ sung mục mô tả event flow: `send-otp`, `user.events`.
- [ ] Nếu có thể, bổ sung hình minh họa hoặc sơ đồ kiến trúc.

**Tệp ưu tiên:**

- `docker-compose.yml`
- `nginx.conf`
- `README.md`
- `.env.example` của các service

**Tiêu chí hoàn thành:**

- Người khác có thể sao chép kho mã và hiểu cách khởi chạy thông qua README.
- Mô tả triển khai rõ ràng hơn khi ghi vào hồ sơ ứng tuyển.
- Có thể giải thích ngắn gọn boundary của từng service, event flow và cách chạy full local stack.

## Trường Hợp Thời Gian Hạn Chế

Vui lòng thực hiện 4 mục sau trước:

- [ ] Ngày 1: Kiểm xác thực dữ liệu và xử lý lỗi
- [ ] Ngày 3: Kiểm thử dịch vụ người dùng
- [ ] Ngày 5: Quy trình CI
- [ ] Ngày 7: Docker, hạ tầng cục bộ và README

## Mục Tiêu Cho Hồ Sơ Ứng Tuyển Sau Khi Hoàn Thành

- [ ] Có thể trình bày rõ ràng về việc đã bổ sung kiểm xác thực dữ liệu, xác thực JWT và giới hạn tần suất.
- [ ] Có thể trình bày rõ ràng về việc đã viết các bài kiểm thử đơn vị hoặc kiểm thử tích hợp cơ bản.
- [ ] Có thể trình bày rõ ràng về việc đã thiết lập CI cho bản dựng, kiểm tra cú pháp và kiểm thử.
- [ ] Có thể trình bày rõ ràng về việc đã đóng gói dịch vụ bằng container và sử dụng Nginx làm cổng định tuyến.
- [ ] Có thể trình bày rõ ràng về việc đã dùng RabbitMQ để giao tiếp bất đồng bộ giữa các service.
- [ ] Có thể trình bày rõ ràng về việc mỗi service sở hữu trách nhiệm riêng và không phụ thuộc trực tiếp vào database của service khác.

## Mục Tiêu Cho Kiến Trúc Microservice Sau Khi Hoàn Thành

- [ ] User service, chat service và mail service có boundary rõ ràng hơn về dữ liệu và trách nhiệm.
- [ ] Chat service không còn phụ thuộc vào thông tin người dùng theo kiểu gọi chéo trực tiếp ở runtime cho các luồng chính.
- [ ] Realtime state quan trọng không chỉ nằm trong memory cục bộ của một instance.
- [ ] Full local stack có thể chạy bằng một tài liệu rõ ràng và một cấu hình môi trường nhất quán.
- [ ] Những thay đổi mới có cơ chế phát hiện hồi quy thông qua test và CI.
