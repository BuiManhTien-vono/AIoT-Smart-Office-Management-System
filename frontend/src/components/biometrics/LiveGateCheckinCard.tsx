import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../common/Icon';
import { testGateCheckin } from '../../services/biometricsService';
import type { AiGateCheckinResponse } from '../../types/biometrics.types';

type LiveScanStatus =
  | 'IDLE'
  | 'SEARCHING'
  | 'NO_FACE'
  | 'SPOOF'
  | 'NOT_MATCHED'
  | 'SUCCESS'
  | 'BACKEND_ERROR';

export function LiveGateCheckinCard() {
  const [useWebcam, setUseWebcam] = useState<boolean>(true);
  // Scan mode: 'auto' (luôn quét liên tục) or 'manual' (quét khi bấm nút)
  const [scanMode, setScanMode] = useState<'auto' | 'manual'>('auto');
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isApiPending, setIsApiPending] = useState<boolean>(false);
  const isApiPendingRef = useRef<boolean>(false);

  // Status phản hồi thời gian thực
  const [scanStatus, setScanStatus] = useState<LiveScanStatus>('SEARCHING');
  const [statusMessage, setStatusMessage] = useState<string>('Đang tìm khuôn mặt...');
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraId, setCameraId] = useState<string>('GATE_CAM_ENTRANCE_01');
  const [result, setResult] = useState<AiGateCheckinResponse | null>(null);

  // Cooldown timer ref sau khi nhận diện thành công
  const cooldownRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<number | null>(null);

  // Stop webcam
  const stopWebcam = useCallback(() => {
    if (cooldownTimerRef.current) {
      window.clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Start webcam
  const startWebcam = useCallback(async () => {
    stopWebcam();
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
      setScanStatus('SEARCHING');
      setStatusMessage('Camera sẵn sàng. Đang quét liên tục...');
    } catch (err) {
      console.error('Camera access error:', err);
      setScanStatus('IDLE');
      setStatusMessage('Không thể mở Webcam. Vui lòng cấp quyền camera hoặc tải ảnh từ máy tính.');
      setUseWebcam(false);
    }
  }, [stopWebcam]);

  useEffect(() => {
    if (useWebcam) {
      void startWebcam();
    } else {
      stopWebcam();
    }
    return () => {
      stopWebcam();
    };
  }, [useWebcam, startWebcam, stopWebcam]);

  // Grab frame from video as Blob
  const grabVideoFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        return resolve(null);
      }
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
    });
  }, []);

  // Perform continuous gate checkin scan
  const scanFrame = useCallback(async (blob?: Blob) => {
    if (isApiPendingRef.current || cooldownRef.current) return;

    let payload = blob;
    if (!payload && useWebcam) {
      payload = (await grabVideoFrame()) || undefined;
    }

    if (!payload) return;

    isApiPendingRef.current = true;
    setIsApiPending(true);
    try {
      const data = await testGateCheckin(payload, cameraId);
      setResult(data);

      const isSuccess =
        data.status === 'CHECKED_IN_OUT' ||
        (data.success && Boolean(data.identification?.isMatched));

      const isSpoof =
        !isSuccess &&
        (data.status === 'SPOOFING_ATTEMPT' ||
          data.liveness?.is_real === false ||
          (data.liveness_score !== undefined && data.liveness_score < 0.6));

      // TRƯỜNG HỢP 1: THÀNH CÔNG (Người thật & Khớp nhân viên)
      if (isSuccess) {
        setScanStatus('SUCCESS');
        const empName = data.identification?.fullName || 'Nhân viên';
        const isDebounced = Boolean(data.attendance?.isDebounced);

        if (isDebounced) {
          setStatusMessage(`${empName} đã chấm công trước đó. Chuẩn bị người tiếp theo...`);
        } else {
          setStatusMessage(`ĐIỂM DANH THÀNH CÔNG: ${empName}!`);
        }

        // Tạm dừng 3s đếm ngược hiển thị kết quả, rồi TỰ ĐỘNG QUÉT TIẾP NGƯỜI MỚI (chế độ Kiosk Auto)
        cooldownRef.current = true;
        setCooldownRemaining(3);

        if (cooldownTimerRef.current) {
          window.clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
        }

        let remaining = 3;
        cooldownTimerRef.current = window.setInterval(() => {
          remaining -= 1;
          if (remaining > 0) {
            setCooldownRemaining(remaining);
          } else {
            if (cooldownTimerRef.current) {
              window.clearInterval(cooldownTimerRef.current);
              cooldownTimerRef.current = null;
            }
            setCooldownRemaining(null);
            cooldownRef.current = false;
            setResult(null); // Xóa bảng kết quả người cũ để sẵn sàng hiển thị người mới
            setScanStatus('SEARCHING');
            setStatusMessage('Sẵn sàng quét người tiếp theo...');
            if (scanMode === 'manual') {
              setIsScanning(false);
            }
          }
        }, 1000);
      }
      // TRƯỜNG HỢP 2: PHÁT HIỆN GIẢ MẠO (Không phải người thật)
      else if (isSpoof) {
        setScanStatus('SPOOF');
        setStatusMessage('CẢNH BÁO: ĐÂY KHÔNG PHẢI NGƯỜI THẬT! Phát hiện ảnh chụp/màn hình giả mạo.');
        // VẪN TIẾP TỤC QUÉT ở frame tiếp theo (không dừng) cho đến khi người thật bước vào
      }
      // TRƯỜNG HỢP 3: NGƯỜI THẬT NHƯNG CHƯA KHỚP NHÂN VIÊN
      else {
        setScanStatus('NOT_MATCHED');
        setStatusMessage('Người thật, nhưng không tìm thấy nhân viên trong CSDL. Tiếp tục quét...');
        // VẪN TIẾP TỤC QUÉT ở frame tiếp theo
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : String(err);
      const isNoFace =
        status === 422 ||
        msg.includes('Không tìm thấy khuôn mặt') ||
        msg.includes('khu\u00f4n m\u1eb7t') ||
        msg.includes('khuôn mặt');

      const isBackendError =
        status === 502 ||
        status === 503 ||
        msg.includes('10061') ||
        msg.includes('refused') ||
        msg.includes('502') ||
        msg.includes('urlopen error') ||
        msg.includes('Failed to fetch');

      // TRƯỜNG HỢP 4: KHÔNG PHÁT HIỆN ĐƯỢC KHUÔN MẶT
      if (isNoFace) {
        setScanStatus('NO_FACE');
        setStatusMessage('Không phát hiện khuôn mặt. Vui lòng nhìn thẳng vào khung oval.');
        setResult(null);
      } else if (isBackendError) {
        // TRƯỜNG HỢP 5: MẤT KẾT NỐI TỚI BACKEND / CSDL
        setScanStatus('BACKEND_ERROR');
        setStatusMessage('Đã nhận diện người thật, nhưng không kết nối được Backend (.NET / CSDL).');
      } else {
        // Giữ thông báo hiện tại nếu đang hiển thị kết quả phân tích
        setStatusMessage((prev) =>
          prev.includes('CẢNH BÁO') || prev.includes('XÁC THỰC') ? prev : 'Đang kết nối nhận diện...'
        );
      }
    } finally {
      isApiPendingRef.current = false;
      setIsApiPending(false);
    }
  }, [useWebcam, grabVideoFrame, cameraId, scanMode]);

  // Vòng lặp tự động quét liên tục thời gian thực (Kiosk Auto Scanner Loop)
  // Đảm bảo không bao giờ bị dừng/ngắt quãng giữa các lượt người
  useEffect(() => {
    if (!useWebcam) return;

    let cancelled = false;

    async function runContinuousScanner() {
      while (!cancelled) {
        const shouldRun = scanMode === 'auto' || isScanning;

        if (shouldRun && !cooldownRef.current && !isApiPendingRef.current) {
          await scanFrame();
        }

        // Chu kỳ kiểm tra 650ms giữa các lần quét
        await new Promise((r) => setTimeout(r, 650));
      }
    }

    void runContinuousScanner();

    return () => {
      cancelled = true;
    };
  }, [useWebcam, scanMode, isScanning, scanFrame]);

  // Manual File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    void scanFrame(file);
  };

  const livenessScore = result?.liveness?.real_score ?? result?.liveness_score ?? 0;
  const isReal =
    result?.status === 'CHECKED_IN_OUT'
      ? true
      : (result?.liveness?.is_real ?? (livenessScore >= 0.6));
  const isMatched =
    Boolean(result?.identification?.isMatched) || result?.status === 'CHECKED_IN_OUT';

  // Dynamic Border Color for Oval Guide
  const getGuideBorderColor = () => {
    switch (scanStatus) {
      case 'SUCCESS':
        return '#10B981'; // Green
      case 'SPOOF':
        return '#EF4444'; // Red
      case 'NOT_MATCHED':
      case 'BACKEND_ERROR':
        return '#F59E0B'; // Amber
      case 'NO_FACE':
        return '#94A3B8'; // Slate/gray indicator for no face
      default:
        return isApiPending ? '#2563EB' : 'rgba(255, 255, 255, 0.85)';
    }
  };

  return (
    <div className="panel gate-card">
      {/* Header */}
      <div className="gate-card-header">
        <div className="gate-header-title">
          <div className="gate-icon-badge">
            <Icon name="camera" size={22} />
          </div>
          <div>
            <h3>Cổng Chấm công Sinh trắc học (AI Face Check-in)</h3>
            <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
              Quét liên tục đến khi thành công hoặc bạn dừng lại: Tự động phân biệt người thật MiniFASNet-V2 và đối sánh ArcFace 1:N.
            </p>
          </div>
        </div>

        {/* Camera Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="gate-cam-id" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted-foreground)' }}>
            CỔNG:
          </label>
          <select
            id="gate-cam-id"
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            style={{ minHeight: '32px', padding: '2px 8px', fontSize: '0.8125rem' }}
          >
            <option value="GATE_CAM_ENTRANCE_01">Cổng chính vào (Cam 01)</option>
            <option value="GATE_CAM_EXIT_02">Cổng phụ ra (Cam 02)</option>
            <option value="KIOSK_LOBBY_01">Kiosk sảnh lễ tân</option>
          </select>
        </div>
      </div>

      {/* Control Bar: Mode Toggle & Source Switch */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--status-neutral-soft)',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
        }}
      >
        {/* Toggle Switch between Auto and Manual */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>CHẾ ĐỘ QUÉT:</span>
          <div style={{ display: 'inline-flex', background: 'var(--color-surface)', padding: '2px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className={`button ${scanMode === 'auto' ? 'button-primary' : 'button-secondary'}`}
              style={{ minHeight: '30px', padding: '2px 14px', fontSize: '0.8125rem', border: 'none' }}
              onClick={() => {
                setScanMode('auto');
                setIsScanning(true);
              }}
            >
              ● Luôn tự động quét (Auto)
            </button>
            <button
              type="button"
              className={`button ${scanMode === 'manual' ? 'button-primary' : 'button-secondary'}`}
              style={{ minHeight: '30px', padding: '2px 14px', fontSize: '0.8125rem', border: 'none' }}
              onClick={() => {
                setScanMode('manual');
                setIsScanning(false);
              }}
            >
              ○ Quét khi bấm nút (Manual)
            </button>
          </div>
        </div>

        {/* Camera or File Source */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className={`button ${useWebcam ? 'button-primary' : 'button-secondary'}`}
            style={{ minHeight: '32px', padding: '2px 12px', fontSize: '0.8125rem' }}
            onClick={() => {
              setUseWebcam(true);
            }}
          >
            <Icon name="camera" size={15} /> Bật Webcam
          </button>
          <button
            type="button"
            className={`button ${!useWebcam ? 'button-primary' : 'button-secondary'}`}
            style={{ minHeight: '32px', padding: '2px 12px', fontSize: '0.8125rem' }}
            onClick={() => {
              setUseWebcam(false);
              stopWebcam();
            }}
          >
            <Icon name="reports" size={15} /> Tải ảnh
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="gate-card-content">
        {/* Left: Live Video Feed */}
        <div>
          <div className="enroll-viewport-container" style={{ minHeight: '340px' }}>
            {useWebcam && (
              <div className="camera-feed-box">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="camera-video-stream"
                />

                {/* Status Pill on top of camera */}
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    right: '12px',
                    zIndex: 10,
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    className={`badge ${
                      scanStatus === 'SUCCESS'
                        ? 'badge-success'
                        : scanStatus === 'SPOOF'
                        ? 'badge-danger'
                        : scanStatus === 'NOT_MATCHED' || scanStatus === 'BACKEND_ERROR'
                        ? 'badge-warning'
                        : scanStatus === 'NO_FACE'
                        ? 'badge-warning'
                        : 'badge-info'
                    }`}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.8125rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    }}
                  >
                    {statusMessage}
                  </span>
                </div>

                <div className="camera-guide-overlay">
                  <div
                    className="face-oval-guide"
                    style={{
                      borderColor: getGuideBorderColor(),
                      boxShadow: `0 0 15px ${getGuideBorderColor()}`,
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    }}
                  />
                  <span className="guide-hint">
                    {scanStatus === 'SUCCESS'
                      ? (cooldownRemaining ? `✓ ĐÃ ĐIỂM DANH (Tiếp tục sau ${cooldownRemaining}s)` : '✓ NHẬN DIỆN THÀNH CÔNG')
                      : scanStatus === 'SPOOF'
                      ? '⚠️ KHÔNG PHẢI NGƯỜI THẬT'
                      : scanStatus === 'NOT_MATCHED'
                      ? '⚠️ KHÔNG TÌM THẤY NHÂN VIÊN'
                      : scanStatus === 'NO_FACE'
                      ? '⚠️ KHÔNG PHÁT HIỆN KHUÔN MẶT'
                      : scanStatus === 'BACKEND_ERROR'
                      ? '⚠️ CHƯA KẾT NỐI BACKEND .NET / CSDL'
                      : scanMode === 'auto'
                      ? 'Đang liên tục quét khuôn mặt (Auto)...'
                      : isScanning
                      ? 'Đang quét đến khi thành công...'
                      : 'Nhấn Bắt đầu quét để chấm công'}
                  </span>
                </div>

                {/* On-camera Success Alert Overlay */}
                {scanStatus === 'SUCCESS' && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(16, 185, 129, 0.22)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 15,
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.92)',
                        border: '2px solid #10B981',
                        borderRadius: '14px',
                        padding: '16px 24px',
                        textAlign: 'center',
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
                        maxWidth: '85%',
                      }}
                    >
                      <div
                        style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '50%',
                          background: '#10B981',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 8px',
                        }}
                      >
                        <Icon name="check" size={32} />
                      </div>
                      <h4 style={{ margin: '0 0 4px', color: '#10B981', fontSize: '1.15rem', fontWeight: 700 }}>
                        ĐIỂM DANH THÀNH CÔNG!
                      </h4>
                      <p style={{ margin: '0 0 2px', color: '#ffffff', fontSize: '0.95rem', fontWeight: 600 }}>
                        {result?.identification?.fullName || 'Nhân viên'}
                      </p>
                      {result?.identification?.employeeCode && (
                        <p style={{ margin: '0 0 6px', color: '#94a3b8', fontSize: '0.8125rem' }}>
                          Mã NV: {result.identification.employeeCode}
                        </p>
                      )}
                      {cooldownRemaining !== null && (
                        <div style={{ marginTop: '6px', fontSize: '0.8125rem', color: '#38bdf8', fontWeight: 500 }}>
                          Sẵn sàng quét người tiếp theo trong <strong>{cooldownRemaining}s</strong>...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!useWebcam && (
              <div
                className="file-drop-box"
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: 'pointer', width: '100%', height: '100%' }}
              >
                <Icon name="camera" size={48} className="drop-icon" />
                <p style={{ margin: '8px 0', fontWeight: 600, color: '#ffffff' }}>
                  Nhấp để chọn ảnh nhân viên chấm công
                </p>
                <span className="muted" style={{ fontSize: '0.75rem' }}>Hỗ trợ JPG, PNG</span>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileUpload}
            className="file-input-hidden"
          />

          {/* Action button: Start scan in manual mode */}
          {useWebcam && scanMode === 'manual' && !isScanning && (
            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                className="button button-primary"
                style={{ width: '100%', padding: '10px 16px', fontSize: '0.9375rem' }}
                onClick={() => {
                  setIsScanning(true);
                  setScanStatus('SEARCHING');
                  setStatusMessage('Đang quét liên tục đến khi thành công...');
                }}
              >
                <Icon name="shieldCheck" size={20} />
                Bắt đầu quét khuôn mặt
              </button>
            </div>
          )}
        </div>

        {/* Right: Real-time Feedback & Verification Results */}
        <div>
          {/* Banner 1: SPOOFING ALERT */}
          {scanStatus === 'SPOOF' && (
            <div
              className="panel"
              style={{
                padding: '16px',
                background: 'var(--status-danger-soft)',
                border: '2px solid var(--status-danger)',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Icon name="warning" size={36} style={{ color: 'var(--status-danger-text)' }} />
                <div>
                  <h4 style={{ margin: '0 0 2px', fontSize: '1.125rem', fontWeight: 700, color: 'var(--status-danger-text)' }}>
                    CẢNH BÁO: ĐÂY KHÔNG PHẢI NGƯỜI THẬT!
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--status-danger-text)' }}>
                    Mô hình MiniFASNet-V2 phát hiện hình ảnh giả mạo (ảnh in giấy hoặc chụp lại màn hình điện thoại). Vẫn tiếp tục quét...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Banner 2: NOT MATCHED ALERT */}
          {scanStatus === 'NOT_MATCHED' && (
            <div
              className="panel"
              style={{
                padding: '16px',
                background: 'var(--status-warning-soft)',
                border: '1px solid var(--status-warning)',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Icon name="warning" size={32} style={{ color: 'var(--status-warning-text)' }} />
                <div>
                  <h4 style={{ margin: '0 0 2px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--status-warning-text)' }}>
                    XÁC THỰC THẤT BẠI: KHÔNG TÌM THẤY NHÂN VIÊN
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--status-warning-text)' }}>
                    Đã xác nhận là người thật nhưng khuôn mặt chưa có trong CSDL. Camera đang tiếp tục quét...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Banner 3: SUCCESS ALERT */}
          {scanStatus === 'SUCCESS' && (
            <div
              className="panel"
              style={{
                padding: '16px',
                background: 'var(--status-success-soft)',
                border: '2px solid var(--status-success)',
                borderRadius: '10px',
                marginBottom: '16px',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: 'var(--status-success)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="check" size={26} />
                </div>
                <div style={{ flex: 1 }}>
                  <h4
                    style={{
                      margin: '0 0 2px',
                      fontSize: '1.15rem',
                      fontWeight: 700,
                      color: 'var(--status-success-text)',
                    }}
                  >
                    XÁC THỰC THÀNH CÔNG: ĐIỂM DANH HỢP LỆ!
                  </h4>
                  <p
                    style={{
                      margin: '0 0 2px',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: 'var(--status-success-text)',
                    }}
                  >
                    Chào mừng {result?.identification?.fullName || 'nhân viên'}
                    {result?.identification?.employeeCode
                      ? ` (Mã NV: ${result.identification.employeeCode})`
                      : ''}! Đã ghi nhận lượt điểm danh.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted-foreground)' }}>
                    {result?.attendance?.timestamp
                      ? `Thời gian: ${result.attendance.timestamp} • Trạng thái: ${result.attendance.event_type || result.attendance.status || 'Hợp lệ'}`
                      : 'Hệ thống đã tự động ghi nhận lượt điểm danh vào cơ sở dữ liệu.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Banner 4: NO FACE ALERT */}
          {scanStatus === 'NO_FACE' && (
            <div
              className="panel"
              style={{
                padding: '16px',
                background: 'rgba(100, 116, 139, 0.12)',
                border: '2px solid #64748B',
                borderRadius: '10px',
                marginBottom: '16px',
                boxShadow: '0 4px 16px rgba(100, 116, 139, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: '#64748B',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="camera" size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <h4
                    style={{
                      margin: '0 0 2px',
                      fontSize: '1.15rem',
                      fontWeight: 700,
                      color: 'var(--color-foreground)',
                    }}
                  >
                    KHÔNG PHÁT HIỆN ĐƯỢC KHUÔN MẶT
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-muted-foreground)' }}>
                    Không tìm thấy khuôn mặt trong khung hình. Vui lòng nhìn thẳng vào camera và căn chỉnh khuôn mặt vào giữa khung oval.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Banner 5: BACKEND DISCONNECTED ALERT */}
          {scanStatus === 'BACKEND_ERROR' && (
            <div
              className="panel"
              style={{
                padding: '16px',
                background: 'var(--status-warning-soft)',
                border: '2px solid var(--status-warning)',
                borderRadius: '10px',
                marginBottom: '16px',
                boxShadow: '0 4px 16px rgba(245, 158, 11, 0.2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: 'var(--status-warning)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="warning" size={26} />
                </div>
                <div style={{ flex: 1 }}>
                  <h4
                    style={{
                      margin: '0 0 2px',
                      fontSize: '1.15rem',
                      fontWeight: 700,
                      color: 'var(--status-warning-text)',
                    }}
                  >
                    CHƯA KẾT NỐI ĐƯỢC BACKEND (.NET) / CSDL
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--status-warning-text)' }}>
                    AI đã xác nhận khuôn mặt là người thật, nhưng không thể kết nối tới Backend .NET (cổng 5155) để tra cứu CSDL nhân viên. Vui lòng kiểm tra và khởi động Backend .NET WebApi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Metric Cards */}
          {result ? (
            <div className="result-metric-grid">
              {/* Liveness Check Card */}
              <div className="result-card">
                <span className="result-label">1. CHỐNG GIẢ MẠO SINH TRẮC HỌC (LIVENESS)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`badge ${isReal ? 'badge-success' : 'badge-danger'}`}>
                    {isReal ? 'MẶT THẬT (REAL)' : 'GIẢ MẠO (SPOOF)'}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    Độ tin cậy: {(livenessScore * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Identity Recognition Card */}
              <div className="result-card">
                <span className="result-label">2. ĐỊNH DANH NHÂN VIÊN (ARCFACE 1:N)</span>
                {isMatched && result.identification ? (
                  <div>
                    <div className="emp-match-name">
                      {result.identification.fullName || 'Nhân viên'}
                    </div>
                    <div className="emp-match-code">
                      Mã nhân viên: <strong>{result.identification.employeeCode || 'N/A'}</strong>
                    </div>
                    <div className="muted" style={{ fontSize: '0.8125rem', marginTop: '4px' }}>
                      Độ tương đồng khuôn mặt: {(((result.identification.similarity ?? 0)) * 100).toFixed(1)}%
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--status-danger-text)', fontWeight: 600 }}>
                    {result.identification?.fullName || 'Không tìm thấy khuôn mặt trong CSDL'}
                  </div>
                )}
              </div>

              {/* Attendance Event Card */}
              <div className="result-card">
                <span className="result-label">3. GHI NHẬN CHẤM CÔNG VÀO CSDL</span>
                {result.attendance?.recorded || result.attendance?.status ? (
                  <div>
                    <span className="badge badge-success">
                      {result.attendance.event_type || result.attendance.status || 'CHECK-IN THÀNH CÔNG'}
                    </span>
                    <div className="muted" style={{ fontSize: '0.8125rem', marginTop: '4px' }}>
                      Thời gian ghi nhận: {result.attendance.timestamp || 'Vừa xong'}
                    </div>
                  </div>
                ) : (
                  <span className="badge badge-warning">
                    Chưa cập nhật ca chấm công
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="gate-placeholder">
              <Icon name="shieldCheck" size={54} style={{ opacity: 0.35, marginBottom: '10px' }} />
              <h4 style={{ margin: '0 0 6px', fontWeight: 600 }}>
                {scanStatus === 'NO_FACE'
                  ? 'Chưa phát hiện khuôn mặt'
                  : scanStatus === 'BACKEND_ERROR'
                  ? 'Chưa kết nối Backend .NET / CSDL'
                  : 'Đang trong tiến trình quét'}
              </h4>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                {scanStatus === 'NO_FACE'
                  ? 'Vui lòng đứng trước camera, đủ ánh sáng và nhìn thẳng vào khung oval.'
                  : scanStatus === 'BACKEND_ERROR'
                  ? 'Khuôn mặt đã được AI xác nhận, nhưng cần Backend .NET (cổng 5155) đang chạy để tra cứu dữ liệu nhân viên.'
                  : 'Hệ thống sẽ liên tục quét từng khung hình cho đến khi nhận diện thành công.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
