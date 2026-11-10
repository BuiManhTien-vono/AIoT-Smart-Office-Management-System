import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { Department, CreateEmployeeInput } from '../../types/biometrics.types';
import {
  createEmployee,
  extractFaceFeatures,
  registerBiometricVector,
} from '../../services/biometricsService';

type ScanFeedbackType = 'SEARCHING' | 'NO_FACE' | 'MULTIPLE' | 'BLURRY' | 'SUCCESS';

interface CreateEmployeeWithBiometricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  departments: Department[];
  onSuccess: () => void;
}

export function CreateEmployeeWithBiometricsModal({
  isOpen,
  onClose,
  token,
  departments,
  onSuccess,
}: CreateEmployeeWithBiometricsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step: 1 = Basic Info, 2 = AI Face Scan
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Form Basic Info state
  const [empCode, setEmpCode] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [deptId, setDeptId] = useState<string>('');

  // Biometric AI Scan state
  const [useCamera, setUseCamera] = useState<boolean>(true);
  const streamRef = useRef<MediaStream | null>(null);

  // Scan Mode: 'auto' (quét tự động liên tục) or 'manual' (quét khi bấm nút)
  const [scanMode, setScanMode] = useState<'auto' | 'manual'>('auto');
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const scanIntervalRef = useRef<number | null>(null);

  // Feedback thời gian thực
  const [feedbackType, setFeedbackType] = useState<ScanFeedbackType>('SEARCHING');
  const [feedbackMessage, setFeedbackMessage] = useState<string>('Đang quét khuôn mặt chính diện...');

  const [blurScore, setBlurScore] = useState<number | null>(null);
  const [extractedVector, setExtractedVector] = useState<number[] | null>(null);

  // Global submit state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Clear overlay canvas
  const clearOverlay = useCallback(() => {
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
  }, []);

  // Draw Bounding Box onto live overlay canvas
  const drawFaceBbox = useCallback((bbox: [number, number, number, number]) => {
    if (!overlayCanvasRef.current || !videoRef.current) return;
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const [x1, y1, x2, y2] = bbox;
    const boxW = x2 - x1;
    const boxH = y2 - y1;
    const drawX = Math.max(0, canvas.width - x2);

    // Green bounding box
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 3;
    ctx.strokeRect(drawX, y1, boxW, boxH);

    // Label
    ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
    const labelText = `Chính diện (${Math.round(boxW)}x${Math.round(boxH)})`;
    ctx.font = 'bold 14px Inter, sans-serif';
    const textWidth = ctx.measureText(labelText).width;
    ctx.fillRect(drawX, y1 - 24 > 0 ? y1 - 24 : y1, textWidth + 10, 22);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(labelText, drawX + 5, y1 - 24 > 0 ? y1 - 8 : y1 + 16);
  }, []);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    clearOverlay();
  }, [clearOverlay]);

  // Start camera helper
  const startCamera = useCallback(async () => {
    stopCamera();
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
      setFeedbackType('SEARCHING');
      setFeedbackMessage('Nhìn thẳng vào giữa khung oval để quét khuôn mặt...');
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Không thể mở camera. Bạn có thể chọn tải ảnh từ máy tính.');
      setUseCamera(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      setCurrentStep(1);
      setError(null);
      setExtractedVector(null);
      setBlurScore(null);
      setIsScanning(true);
      setFeedbackType('SEARCHING');
      setFeedbackMessage('Đang quét khuôn mặt chính diện...');
    } else {
      stopCamera();
      if (dialog.open) dialog.close();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  useEffect(() => {
    if (currentStep === 2 && useCamera) {
      void startCamera();
    } else if (currentStep !== 2) {
      stopCamera();
    }
  }, [currentStep, useCamera, startCamera, stopCamera]);

  // Grab video frame as Blob
  const grabFrameBlob = useCallback((): Promise<Blob | null> => {
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
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95);
    });
  }, []);

  // Perform AI Face Extraction attempt (vẫn tiếp tục quét cho đến khi đạt chuẩn hoặc từ bỏ)
  const processFaceExtraction = useCallback(
    async (fileOrBlob?: Blob) => {
      if (isExtracting || extractedVector) return;

      let payload = fileOrBlob;
      if (!payload && useCamera) {
        payload = (await grabFrameBlob()) || undefined;
      }
      if (!payload) return;

      setIsExtracting(true);
      try {
        const res = await extractFaceFeatures(payload);
        if (res.bbox) {
          drawFaceBbox(res.bbox);
        } else {
          clearOverlay();
        }
        if (!res.success) {
          if (res.error_code === 'MULTIPLE_FACES') {
            setFeedbackType('MULTIPLE');
            setFeedbackMessage('Phát hiện nhiều người. Vui lòng chỉ đứng 1 người trước camera.');
          } else if (res.error_code === 'NO_FACE_DETECTED') {
            setFeedbackType('NO_FACE');
            setFeedbackMessage('Chưa thấy khuôn mặt. Nhìn thẳng vào khung hình...');
          } else {
            setFeedbackType('BLURRY');
            setFeedbackMessage(res.message || 'Vui lòng tiến gần camera hơn một chút...');
          }
          return;
        }

        const score = res.blur_score ?? 100;
        setBlurScore(score);

        if (res.bbox) {
          drawFaceBbox(res.bbox);
        }

        // KIỂM ĐỊNH THÀNH CÔNG: Đúng 1 mặt, độ nét Laplace >= 100
        if (score >= 100 && res.embedding && res.embedding.length === 512) {
          setExtractedVector(res.embedding);
          setFeedbackType('SUCCESS');
          setFeedbackMessage(`ĐÃ QUÉT THÀNH CÔNG! Độ nét Laplace: ${score.toFixed(1)} (Đạt chuẩn)`);
          setError(null);

          // Tự động dừng quét khi đã thành công!
          setIsScanning(false);
          if (scanIntervalRef.current) {
            window.clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }
        } else if (score < 100) {
          // Thất bại tạm thời về độ nét: VẪN TIẾP TỤC QUÉT
          setFeedbackType('BLURRY');
          setFeedbackMessage(`Mặt hơi mờ (Laplace: ${score.toFixed(1)} < 100). Đang tiếp tục quét nét hơn...`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('Không tìm thấy khuôn mặt')) {
          setFeedbackType('NO_FACE');
          setFeedbackMessage('Chưa thấy khuôn mặt. Vui lòng nhìn vào khung oval...');
        }
      } finally {
        setIsExtracting(false);
      }
    },
    [isExtracting, extractedVector, useCamera, grabFrameBlob, drawFaceBbox, clearOverlay]
  );

  // Continuous auto loop scanner (quét liên tục cho đến khi thành công hoặc người dùng từ bỏ)
  useEffect(() => {
    if (currentStep !== 2 || !useCamera || extractedVector) {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    const shouldRun = scanMode === 'auto' || isScanning;

    if (shouldRun) {
      if (!scanIntervalRef.current) {
        // Quét liên tục mỗi 900ms cho đến khi thành công hoặc từ bỏ
        scanIntervalRef.current = window.setInterval(() => {
          void processFaceExtraction();
        }, 900);
      }
    } else {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }

    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [currentStep, useCamera, extractedVector, scanMode, isScanning, processFaceExtraction]);

  // Handle single file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setExtractedVector(null);
    void processFaceExtraction(file);
  };

  // Reset face scan to re-scan
  const handleResetScan = () => {
    setExtractedVector(null);
    setBlurScore(null);
    setError(null);
    clearOverlay();
    setFeedbackType('SEARCHING');
    setFeedbackMessage('Đang quét lại khuôn mặt...');
    setIsScanning(true);
  };

  // Complete Registration
  const handleCompleteRegistration = async () => {
    if (!empCode || !fullName || !deptId) {
      setError('Vui lòng điền đủ các thông tin bắt buộc của nhân viên.');
      setCurrentStep(1);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Tạo nhân viên trên Backend .NET
      const payload: CreateEmployeeInput = {
        employeeCode: empCode.trim().toUpperCase(),
        fullName: fullName.trim(),
        email: email.trim().toLowerCase() || undefined,
        phoneNumber: phone.trim() || undefined,
        departmentId: deptId,
      };

      const createdEmp = await createEmployee(token, payload);

      // 2. Tự động lưu Vector khuôn mặt chính diện 512-D vào DB
      if (extractedVector) {
        await registerBiometricVector(token, createdEmp.id, {
          embeddingVector: extractedVector,
          poseLabel: 'FRONTAL',
          qualityScore: blurScore ?? undefined,
        });
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu dữ liệu vào hệ thống');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOvalBorderColor = () => {
    if (extractedVector) return '#10B981'; // Xanh lá
    if (feedbackType === 'MULTIPLE' || feedbackType === 'BLURRY') return '#EF4444'; // Đỏ
    return 'rgba(255, 255, 255, 0.85)';
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog app-dialog-lg"
      aria-labelledby="create-emp-title"
      onClose={onClose}
    >
      <div className="app-dialog-heading">
        <div>
          <p className="eyebrow">QUẢN TRỊ NHÂN SỰ & SINH TRẮC</p>
          <h2 id="create-emp-title">Đăng ký nhân viên & Quét mặt chính diện</h2>
          <p className="muted">
            Camera quét liên tục từng khung hình cho đến khi phát hiện mặt chính diện đạt chuẩn thì hoàn tất.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary app-dialog-close"
          onClick={onClose}
          aria-label="Đóng"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* Step Indicators */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          type="button"
          className={`button ${currentStep === 1 ? 'button-primary' : 'button-secondary'}`}
          style={{ flex: 1, padding: '8px 12px' }}
          onClick={() => setCurrentStep(1)}
        >
          <Icon name="users" size={16} /> 1. Thông tin nhân sự
        </button>
        <button
          type="button"
          className={`button ${currentStep === 2 ? 'button-primary' : 'button-secondary'}`}
          style={{ flex: 1, padding: '8px 12px' }}
          onClick={() => {
            if (!empCode || !fullName || !deptId) {
              setError('Vui lòng điền mã NV, họ tên và phòng ban trước khi chuyển sang quét mặt.');
              return;
            }
            setError(null);
            setCurrentStep(2);
          }}
        >
          <Icon name="camera" size={16} /> 2. Quét mặt chính diện {extractedVector ? '✓ (Đã có vector)' : ''}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          <Icon name="warning" size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Employee Form */}
      {currentStep === 1 && (
        <div>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <label className="field">
                <span>Mã nhân viên *</span>
                <input
                  type="text"
                  required
                  placeholder="VD: NV001, IT002"
                  value={empCode}
                  onChange={(e) => setEmpCode(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Họ và tên *</span>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <label className="field">
                <span>Email công ty</span>
                <input
                  type="email"
                  placeholder="a.nguyen@smartoffice.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Số điện thoại</span>
                <input
                  type="tel"
                  placeholder="0912345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span>Phòng ban trực thuộc *</span>
              <select
                required
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
              >
                <option value="">-- Chọn phòng ban --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.departmentName} ({d.departmentCode})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="app-dialog-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                if (!empCode || !fullName || !deptId) {
                  setError('Vui lòng điền các trường có dấu * bắt buộc.');
                  return;
                }
                setError(null);
                setCurrentStep(2);
              }}
            >
              Tiếp tục: Quét mặt chính diện <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Live AI Face Scan (Frontal Face only) */}
      {currentStep === 2 && (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Controls: Mode Toggle & Source Toggle */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              background: 'var(--status-neutral-soft)',
              padding: '8px 14px',
              borderRadius: '8px',
            }}
          >
            {/* Toggle switch: Auto vs Manual */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>CHẾ ĐỘ:</span>
              <div style={{ display: 'inline-flex', background: 'var(--color-surface)', padding: '2px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  className={`button ${scanMode === 'auto' ? 'button-primary' : 'button-secondary'}`}
                  style={{ minHeight: '28px', padding: '2px 10px', fontSize: '0.75rem', border: 'none' }}
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
                  style={{ minHeight: '28px', padding: '2px 10px', fontSize: '0.75rem', border: 'none' }}
                  onClick={() => {
                    setScanMode('manual');
                    setIsScanning(false);
                  }}
                >
                  ○ Quét khi bấm nút
                </button>
              </div>
            </div>

            {/* Source switch: Webcam vs File */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`button ${useCamera ? 'button-primary' : 'button-secondary'}`}
                style={{ minHeight: '28px', padding: '2px 10px', fontSize: '0.75rem' }}
                onClick={() => {
                  setUseCamera(true);
                  setError(null);
                }}
              >
                <Icon name="camera" size={14} /> Webcam
              </button>
              <button
                type="button"
                className={`button ${!useCamera ? 'button-primary' : 'button-secondary'}`}
                style={{ minHeight: '28px', padding: '2px 10px', fontSize: '0.75rem' }}
                onClick={() => {
                  setUseCamera(false);
                  stopCamera();
                }}
              >
                <Icon name="reports" size={14} /> Tải ảnh
              </button>
            </div>
          </div>

          {/* Continuous Viewport */}
          <div className="enroll-viewport-container" style={{ minHeight: '320px' }}>
            {useCamera && (
              <div className="camera-feed-box">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="camera-video-stream"
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="camera-video-stream"
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transform: 'none' }}
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
                      feedbackType === 'SUCCESS'
                        ? 'badge-success'
                        : feedbackType === 'MULTIPLE' || feedbackType === 'BLURRY'
                        ? 'badge-danger'
                        : 'badge-info'
                    }`}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.8125rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    }}
                  >
                    {feedbackMessage}
                  </span>
                </div>

                <div className="camera-guide-overlay">
                  <div
                    className="face-oval-guide"
                    style={{
                      borderColor: getOvalBorderColor(),
                      boxShadow: `0 0 14px ${getOvalBorderColor()}`,
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    }}
                  />
                  <span className="guide-hint">
                    {extractedVector
                      ? '✓ ĐÃ NHẬN DIỆN THÀNH CÔNG'
                      : scanMode === 'auto'
                      ? 'Đang liên tục quét đến khi thành công...'
                      : isScanning
                      ? 'Đang quét khuôn mặt...'
                      : 'Nhấn Bắt đầu quét để nhận diện'}
                  </span>
                </div>
              </div>
            )}

            {!useCamera && (
              <div
                className="file-drop-box"
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: 'pointer', width: '100%', height: '100%' }}
              >
                <Icon name="camera" size={44} className="drop-icon" />
                <p style={{ margin: '8px 0', fontSize: '0.875rem', fontWeight: 600, color: '#ffffff' }}>
                  Nhấp để tải ảnh chân dung khuôn mặt chính diện
                </p>
                <span className="muted" style={{ fontSize: '0.75rem' }}>Định dạng JPG, PNG</span>
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
          {useCamera && !extractedVector && scanMode === 'manual' && !isScanning && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="button button-primary"
                style={{ padding: '8px 24px' }}
                onClick={() => {
                  setIsScanning(true);
                  setFeedbackType('SEARCHING');
                  setFeedbackMessage('Đang quét liên tục đến khi thành công...');
                }}
              >
                <Icon name="camera" size={18} /> Bắt đầu quét khuôn mặt
              </button>
            </div>
          )}

          {/* Success Result Card */}
          {extractedVector && (
            <div
              className="panel"
              style={{
                padding: '14px',
                background: 'var(--status-success-soft)',
                border: '1px solid var(--status-success)',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon name="check" size={24} style={{ color: 'var(--status-success-text)' }} />
                  <div>
                    <h4 style={{ margin: '0 0 2px', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--status-success-text)' }}>
                      Đã quét thành công khuôn mặt chính diện!
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--status-success-text)' }}>
                      Độ nét Laplace: <strong>{(blurScore ?? 0).toFixed(1)}</strong> (&ge; 100 Đạt chuẩn) · Vector ArcFace: <strong>512-D</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="button button-secondary"
                  style={{ minHeight: '30px', fontSize: '0.75rem', padding: '2px 10px' }}
                  onClick={handleResetScan}
                >
                  <Icon name="refresh" size={14} /> Quét lại
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="app-dialog-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setCurrentStep(1)}
              disabled={isSubmitting}
            >
              Quay lại thông tin
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleCompleteRegistration}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Đang lưu vào CSDL…'
                : extractedVector
                ? 'Hoàn tất & Lưu vào CSDL'
                : 'Lưu nhân viên (Chưa nạp vector)'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
