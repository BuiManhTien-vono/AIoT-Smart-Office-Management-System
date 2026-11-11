import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import type { Employee, BiometricPose } from '../../types/biometrics.types';
import { POSE_OPTIONS } from '../../types/biometrics.types';
import { extractFaceFeatures, registerBiometricVector } from '../../services/biometricsService';

interface FaceEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  token: string;
  onSuccess: () => void;
}

export function FaceEnrollmentModal({
  isOpen,
  onClose,
  employee,
  token,
  onSuccess,
}: FaceEnrollmentModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [useCamera, setUseCamera] = useState<boolean>(true);
  const streamRef = useRef<MediaStream | null>(null);

  // Scan Mode: 'auto' (quét tự động liên tục) or 'manual' (quét khi bấm nút)
  const [scanMode, setScanMode] = useState<'auto' | 'manual'>('auto');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const scanIntervalRef = useRef<number | null>(null);

  const [pose, setPose] = useState<BiometricPose>('FRONTAL');
  const [blurScore, setBlurScore] = useState<number | null>(null);
  const [extractedVector, setExtractedVector] = useState<number[] | null>(null);
  const [_detectedBbox, setDetectedBbox] = useState<[number, number, number, number] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Clear overlay
  const clearOverlay = useCallback(() => {
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
  }, []);

  // Draw Face Bbox on canvas
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

    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 3;
    ctx.strokeRect(drawX, y1, boxW, boxH);

    ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
    const labelText = `Góc: ${pose} (${Math.round(boxW)}x${Math.round(boxH)})`;
    ctx.font = 'bold 14px Inter, sans-serif';
    const textWidth = ctx.measureText(labelText).width;
    ctx.fillRect(drawX, y1 - 24 > 0 ? y1 - 24 : y1, textWidth + 10, 22);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(labelText, drawX + 5, y1 - 24 > 0 ? y1 - 8 : y1 + 16);
  }, [pose]);

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
    } catch (err) {
      console.error('Camera access error:', err);
      setErrorMessage('Không thể truy cập camera. Vui lòng cấp quyền hoặc tải ảnh từ máy tính.');
      setUseCamera(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      setErrorMessage(null);
      setSuccessMessage(null);
      setBlurScore(null);
      setExtractedVector(null);
      setDetectedBbox(null);
      setIsScanning(false);
      if (useCamera) void startCamera();
    } else {
      stopCamera();
      if (dialog.open) dialog.close();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, useCamera, startCamera, stopCamera]);

  // Grab video frame
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

  // Process face extraction
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
          setDetectedBbox(res.bbox);
          drawFaceBbox(res.bbox);
        } else {
          clearOverlay();
        }

        if (!res.success) {
          if (res.error_code === 'MULTIPLE_FACES') {
            setErrorMessage('Phát hiện nhiều hơn 1 khuôn mặt. Vui lòng chỉ chụp 1 người trước khung hình.');
          } else {
            setErrorMessage(res.message || 'Ảnh không đạt tiêu chuẩn chất lượng.');
          }
          return;
        }

        const score = res.blur_score ?? 100;
        setBlurScore(score);

        if (score >= 20 && res.embedding && res.embedding.length === 512) {
          setExtractedVector(res.embedding);
          setErrorMessage(null);
          setSuccessMessage(
            `Đã quét khuôn mặt thành công (độ nét: ${score.toFixed(1)})! Bạn có thể nhấn Lưu vector sinh trắc học.`
          );
          setIsScanning(false);
          if (scanIntervalRef.current) {
            window.clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }
        } else if (score < 20) {
          setErrorMessage(
            `Khuôn mặt hơi mờ (Laplace: ${score.toFixed(1)} < 20). Đang tiếp tục quét nét hơn...`
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Lỗi khi phân tích ảnh khuôn mặt.';
        setErrorMessage(msg);
      } finally {
        setIsExtracting(false);
      }
    },
    [isExtracting, extractedVector, useCamera, grabFrameBlob, drawFaceBbox, clearOverlay]
  );

  // Auto scan loop
  useEffect(() => {
    if (!useCamera || extractedVector) {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    const shouldRun = scanMode === 'auto' || isScanning;

    if (shouldRun) {
      if (!scanIntervalRef.current) {
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
  }, [useCamera, extractedVector, scanMode, isScanning, processFaceExtraction]);

  // Handle file input
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setExtractedVector(null);
    void processFaceExtraction(file);
    e.target.value = '';
  };

  const handleResetScan = () => {
    setExtractedVector(null);
    setBlurScore(null);
    setDetectedBbox(null);
    setErrorMessage(null);
    clearOverlay();
    if (scanMode === 'manual') {
      setIsScanning(true);
    }
  };

  // Save Biometric Vector
  const handleSaveVector = async () => {
    if (!employee || !extractedVector) {
      setErrorMessage('Chưa có vector đặc trưng để lưu.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const sampleKey = `biometrics/${employee.employeeCode.toLowerCase()}/samples/${pose.toLowerCase()}_${Date.now()}.jpg`;
      await registerBiometricVector(token, employee.id, {
        embeddingVector: extractedVector,
        sampleImageKey: sampleKey,
        poseLabel: pose,
        qualityScore: blurScore ? Math.max(blurScore, 20.0) : 120.0,
      });

      setSuccessMessage(`Đã đăng ký vector góc ${pose} thành công cho ${employee.fullName}!`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi lưu vector vào hệ thống';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !employee) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog app-dialog-lg"
      aria-labelledby="enrollment-modal-title"
      onClose={onClose}
    >
      <div className="app-dialog-heading">
        <div>
          <p className="eyebrow">SINH TRẮC HỌC ARCFACE</p>
          <h2 id="enrollment-modal-title">Quét khuôn mặt cho nhân viên</h2>
          <p className="muted">
            Nhân viên: <strong>{employee.fullName}</strong> ({employee.employeeCode}) — {employee.departmentCode}
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary app-dialog-close"
          onClick={onClose}
          aria-label="Đóng cửa sổ"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div style={{ display: 'grid', gap: '16px' }}>
        {errorMessage && (
          <div className="alert alert-error" role="alert">
            <Icon name="warning" size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success" role="status">
            <Icon name="check" size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Pose Selection */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--status-neutral-soft)', padding: '10px 14px', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>CHỌN GÓC CHỤP:</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {POSE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`button ${pose === opt.value ? 'button-primary' : 'button-secondary'}`}
                style={{ minHeight: '32px', padding: '4px 12px', fontSize: '0.8125rem' }}
                onClick={() => {
                  setPose(opt.value);
                  handleResetScan();
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Toggle & Source Switch */}
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
                ● Tự động quét (Auto)
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

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={`button ${useCamera ? 'button-primary' : 'button-secondary'}`}
              style={{ minHeight: '28px', padding: '2px 10px', fontSize: '0.75rem' }}
              onClick={() => {
                setUseCamera(true);
                setErrorMessage(null);
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

        {/* Viewport: Live Video Stream */}
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

              <div className="camera-guide-overlay">
                <div
                  className="face-oval-guide"
                  style={{
                    borderColor: extractedVector
                      ? 'var(--status-success)'
                      : isExtracting
                      ? 'var(--color-primary)'
                      : 'rgba(255, 255, 255, 0.8)',
                  }}
                />
                <span className="guide-hint">
                  {extractedVector
                    ? `✓ ĐÃ TRÍCH XUẤT THÀNH CÔNG GÓC ${pose}`
                    : isExtracting
                    ? 'Đang phân tích độ nét Laplace & trích xuất vector...'
                    : scanMode === 'auto'
                    ? `Nghiêng mặt theo góc ${pose} vào giữa khung để quét tự động`
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
                Chọn ảnh chân dung góc {pose} (định dạng JPG, PNG)
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

        {/* Manual scan button */}
        {useCamera && scanMode === 'manual' && !extractedVector && !isScanning && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="button button-primary"
              style={{ padding: '8px 24px' }}
              onClick={() => {
                setIsScanning(true);
                setErrorMessage(null);
              }}
            >
              <Icon name="camera" size={18} /> Bắt đầu quét khuôn mặt
            </button>
          </div>
        )}

        {/* Success Card */}
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
                    Đã quét thành công khuôn mặt góc {pose}!
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--status-success-text)' }}>
                    Độ nét Laplace: <strong>{(blurScore ?? 0).toFixed(1)}</strong> (&ge; 20 Đạt chuẩn) · Vector ArcFace: <strong>512-D</strong>
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
      </div>

      <div className="app-dialog-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onClose}
          disabled={isSaving}
        >
          Hủy bỏ
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={handleSaveVector}
          disabled={!extractedVector || isSaving}
        >
          {isSaving ? 'Đang lưu…' : `Lưu mẫu góc ${pose}`}
        </button>
      </div>
    </dialog>
  );
}
