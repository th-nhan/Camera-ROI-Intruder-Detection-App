# Camera ROI Intruder Detection App

Ứng dụng web phát hiện xâm nhập theo thời gian thực dựa trên **Vùng Giám Sát (Region of Interest - ROI)**. Người dùng trực tiếp vẽ một vùng đa giác lên luồng video, hệ thống AI chạy ngay trên trình duyệt sẽ liên tục phân tích từng khung hình và phát cảnh báo ngay khi phát hiện người bước vào khu vực đó.

---

## Dự án làm về gì?

Mục tiêu của dự án là mô phỏng một hệ thống camera an ninh thông minh với khả năng:

- **Người dùng tự thiết lập vùng bảo vệ (ROI):** Click chuột lên màn hình video để đánh dấu các đỉnh, hệ thống tự khép kín thành đa giác.
- **AI nhận dạng người theo thời gian thực:** Mô hình COCO-SSD chạy trực tiếp trên GPU trình duyệt (WebGL) quét mỗi khung hình để phát hiện đối tượng là người với độ tin cậy trên 40%.
- **Phát hiện xâm nhập bằng thuật toán Ray-Casting:** Hệ thống tính tọa độ "bàn chân" của người được nhận dạng và kiểm tra xem điểm đó có nằm bên trong đa giác ROI không. Nếu có, lập tức kích hoạt cảnh báo.
- **Phản hồi trực quan tức thời:** Vùng ROI chuyển từ xanh lá (an toàn) sang đỏ nhấp nháy, kèm thông báo `⚠️ CẢNH BÁO: CÓ NGƯỜI XÂM NHẬP!`.

Video mẫu (`assets/video/NY.mp4`) đóng vai trò luồng camera giả lập, có thể thay bằng luồng camera thật từ thiết bị thông qua Web API.

---

## Công nghệ và thư viện sử dụng

| Công nghệ / Thư viện | Phiên bản | Vai trò |
| :--- | :--- | :--- |
| **Angular** | `^21.2.0` | Framework frontend chính — component, data binding, lifecycle hooks |
| **Angular SSR** | `^21.2.6` | Server-Side Rendering với Express để hỗ trợ prerender |
| **Express** | `^5.1.0` | HTTP server chạy Angular SSR ở môi trường Node.js |
| **TensorFlow.js** | `^4.22.0` | Thư viện AI chạy trên trình duyệt, backend WebGL dùng GPU |
| **COCO-SSD** | `^2.2.3` | Mô hình Object Detection — nhận dạng người trong khung hình |
| **Pose Detection** | `^2.1.3` | Thư viện phát hiện tư thế cơ thể (hỗ trợ mở rộng tính năng) |
| **Fabric.js** | `^7.2.0` | Canvas tương tác — vẽ điểm, đường nối và đa giác ROI lên video |
| **RxJS** | `~7.8.0` | Xử lý luồng bất đồng bộ (reactive streams) |
| **TypeScript** | `~5.9.2` | Ngôn ngữ lập trình chính, type-safe |
| **Vitest** | `^4.0.8` | Framework kiểm thử đơn vị (unit testing) |

---

## Cấu trúc thư mục

```text
camera-roi-app/
├── src/
│   ├── app/
│   │   ├── app.ts          # Logic chính: load model AI, vẽ ROI, Ray-Casting, vòng lặp nhận diện
│   │   ├── app.html        # Giao diện: video player, Fabric canvas overlay, nút điều khiển
│   │   ├── app.scss        # Styling: bố cục, hiệu ứng nhấp nháy khi cảnh báo
│   │   ├── app.config.ts   # Cấu hình Angular (providers, bootstrapping)
│   │   └── app.routes.ts   # Định tuyến Angular
│   ├── assets/
│   │   └── video/          # Video mẫu dùng làm luồng camera giả lập (NY.mp4)
│   ├── index.html          # HTML gốc của ứng dụng
│   ├── main.ts             # Entry point cho trình duyệt
│   └── main.server.ts      # Entry point cho SSR (Node.js)
├── angular.json            # Cấu hình Angular CLI và build targets
├── package.json            # Dependencies và npm scripts
└── tsconfig.json           # Cấu hình TypeScript
```

---

## Cài đặt và chạy

### Yêu cầu
- **Node.js** phiên bản LTS từ v18 trở lên
- Trình duyệt hỗ trợ **WebGL** (Chrome, Edge, Firefox) để AI chạy được bằng GPU

### Các bước

```bash
# 1. Cài đặt dependencies
npm install

# 2. Chạy server phát triển (truy cập tại http://localhost:4200)
npm start

# 3. Build production
npm run build

# 4. Chạy kiểm thử đơn vị
npm test

# 5. Chạy server SSR sau khi build (tùy chọn)
npm run serve:ssr:camera-roi-app
```

---

## Cơ chế hoạt động

```
Khởi động app
    → Load mô hình COCO-SSD (WebGL backend)
    → Người dùng click vẽ các đỉnh trên video
    → Nhấn "Hoàn tất" → Tạo đa giác ROI (Fabric.js Polygon)
    → Vòng lặp detectLoop() chạy liên tục (requestAnimationFrame)
        → Chụp khung hình từ <video> thành tf.Tensor3D
        → COCO-SSD phân tích → lọc đối tượng "person" (score > 0.4)
        → Tính tọa độ bàn chân: footX = x + w/2, footY = y + h/3
        → Ánh xạ tọa độ theo tỉ lệ hiển thị (scaleX, scaleY)
        → Ray-Casting: kiểm tra bàn chân có trong đa giác ROI không
            → Có → Đổi ROI sang đỏ, hiển thị cảnh báo
            → Không → Giữ ROI màu xanh
        → Dispose tensor (tránh memory leak)
        → Lặp lại
```

### Chi tiết thuật toán Ray-Casting

Từ điểm bàn chân `(footX, footY)`, phóng một tia ngang sang phải và đếm số lần tia đó cắt các cạnh của đa giác ROI. Nếu số lần cắt là **lẻ** → điểm nằm trong đa giác (xâm nhập). Nếu **chẵn** → nằm ngoài (an toàn).

---

## Giấy phép

MIT License
