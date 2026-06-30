import { Component, AfterViewInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as fabric from 'fabric';
// Import thư viện AI
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class AppComponent implements AfterViewInit {
  private canvas: any;
  private points: any[] = [];
  private pointObjects: any[] = [];
  private lines: any[] = [];

  private activeRoiPoints: any[] = []; // Lưu lại vùng ROI đã Finish
  private activePolygon: any = null; // Giữ cái hình Polygon để đổi màu
  private videoElement!: HTMLVideoElement;
  private model: cocoSsd.ObjectDetection | null = null;

  public statusMessage: string = 'Đang tải Mô hình AI... Vui lòng đợi';
  public isIntruded: boolean = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  async ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initFabric();

      this.videoElement = document.getElementById('video') as HTMLVideoElement;

      // Khởi động AI
      await this.loadAI();
    }
  }

  // --- PHẦN 1: AI VÀ NHẬN DIỆN ---

  async loadAI() {
    try {
      // Ép TensorFlow dùng backend WebGL để chạy bằng Card Đồ Họa cho mượt
      await tf.setBackend('webgl');
      this.model = await cocoSsd.load();
      this.statusMessage = 'AI đã sẵn sàng! Hãy vẽ vùng ROI.';

      // Bắt đầu vòng lặp quét camera
      this.detectLoop();
    } catch (error) {
      console.error('Lỗi tải AI:', error);
      this.statusMessage = 'Lỗi tải AI. Xem Console.';
    }
  }


  async detectLoop() {
    // THÊM: Chỉ chạy nếu video thực sự đã load xong dữ liệu (readyState >= 2)
    if (
      this.model && //kiểm tra model AI
      this.videoElement && //Có video để coi
      this.videoElement.readyState >= 2 && //Video đã load được hình ảnh thực sự
      this.activeRoiPoints.length >= 3 //đã khoanh được vùng cảnh báo
    ) {
      let imgTensor: tf.Tensor3D | null = null;

      try {
        imgTensor = tf.browser.fromPixels(this.videoElement); //chụp hình
        const predictions = await this.model.detect(imgTensor); //gửi cho AI phân tích

        let foundIntruder = false;

        const videoRealWidth = this.videoElement.videoWidth;
        const videoRealHeight = this.videoElement.videoHeight;
        const displayWidth = this.videoElement.width || 720;
        const displayHeight = this.videoElement.height || 640;

        const scaleX = displayWidth / videoRealWidth;
        const scaleY = displayHeight / videoRealHeight;

        predictions.forEach((prediction) => {          //độ tự tin AI trên 40%
          if (prediction.class === 'person' && prediction.score > 0.4) {
            const [x, y, width, height] = prediction.bbox;

            const footX = (x + width / 2) * scaleX;
            const footY = (y + height / 3) * scaleY;

            if (this.isPointInPolygon({ x: footX, y: footY }, this.activeRoiPoints)) {
              foundIntruder = true;
            }
          }
        });

        this.updateAlertState(foundIntruder);
      } catch (error) {
        console.error('Lỗi trong lúc nhận diện:', error);
      } finally {
        if (imgTensor) {
          imgTensor.dispose(); // Dọn rác RAM
        }
      }
    }

    // Tiếp tục vòng lặp
    requestAnimationFrame(() => this.detectLoop());
  }


  updateAlertState(isDangerous: boolean) {
    if (this.isIntruded !== isDangerous) {
      this.isIntruded = isDangerous;
      this.statusMessage = isDangerous ? '⚠️ CẢNH BÁO: CÓ NGƯỜI XÂM NHẬP!' : '✅ Khu vực an toàn';

      // Đổi màu vùng Polygon
      if (this.activePolygon) {
        this.activePolygon.set(
          'fill',
          isDangerous ? 'rgba(255, 0, 0, 0.4)' : 'rgba(0, 255, 0, 0.3)',
        );
        this.activePolygon.set('stroke', isDangerous ? 'red' : 'green');
        this.canvas.renderAll();
      }
    }
  }

  // Thuật toán Ray-Casting                          //vs là các điểm cái hình đa giác
  isPointInPolygon(point: { x: number; y: number }, vs: any[]) {
    let x = point.x,
      y = point.y; //lấy tọa độ gót chân người đang đứng
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      // lúc đầu: i là điểm đầu j là điểm cuối
      let xi = vs[i].x,
        yi = vs[i].y; // lần chạy thứ 2 sẽ gán lại j là điểm đầu còn i là điểm tiếp theo
      let xj = vs[j].x,
        yj = vs[j].y;

      let intersect = yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // --- PHẦN 2: VẼ BẰNG FABRIC.JS  ---

  initFabric() {
    this.canvas = new fabric.Canvas('fabricCanvas', { selection: false });
    this.canvas.on('mouse:down', (options: any) => {
      // Chỉ cho vẽ nếu chưa có vùng ROI nào
      if (this.activeRoiPoints.length === 0) {
        this.addPoint(options);
      } else {
        alert('Đã có vùng giám sát. Nhấn Xóa Hết để vẽ lại!');
      }
    });
  }

  addPoint(options: any) {
    const pointer = options.scenePoint || options.pointer;
    if (!pointer) return;
    const x = pointer.x;
    const y = pointer.y;

    const circle = new fabric.Circle({
      radius: 5,
      fill: 'red',
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });
    this.canvas.add(circle);
    this.pointObjects.push(circle);

    if (this.points.length > 0) {
      const lastPoint = this.points[this.points.length - 1];
      const line = new fabric.Line([lastPoint.x, lastPoint.y, x, y], {
        stroke: 'yellow',
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      this.canvas.add(line);
      this.lines.push(line);
    }
    this.points.push({ x, y });
    this.canvas.renderAll();
  }

  finishROI() {
    if (this.points.length < 3) {
      alert('Cần ít nhất 3 điểm!');
      return;
    }

    // LƯU LẠI MẢNG TỌA ĐỘ ĐỂ AI DÙNG
    this.activeRoiPoints = [...this.points];

    this.activePolygon = new fabric.Polygon(this.points, {
      fill: 'rgba(0, 255, 0, 0.3)',
      stroke: 'green',
      strokeWidth: 2,
      selectable: false,
      objectCaching: false,
    });

    this.pointObjects.forEach((obj) => this.canvas.remove(obj));
    this.lines.forEach((obj) => this.canvas.remove(obj));
    this.canvas.add(this.activePolygon);

    this.points = [];
    this.pointObjects = [];
    this.lines = [];
    this.canvas.renderAll();
  }

  resetROI() {
    this.canvas.clear();
    this.points = [];
    this.pointObjects = [];
    this.lines = [];
    this.activeRoiPoints = [];
    this.activePolygon = null;
    this.isIntruded = false;
    this.statusMessage = 'AI đang hoạt động. Hãy vẽ vùng ROI.';
  }
}
