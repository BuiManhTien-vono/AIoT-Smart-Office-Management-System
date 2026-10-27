-- =============================================================================
-- SCRIPT KHỞI TẠO CƠ SỞ DỮ LIỆU PHÂN RÃ SCHEMA CHO KIẾN TRÚC MODULAR MONOLITH
-- Học phần: Đồ án Phát triển Ứng dụng phía Máy chủ Nâng cao (608819)
-- Hệ quản trị CSDL: PostgreSQL 16
-- Nguyên tắc Modular Monolith:
--   1. Mỗi Module sở hữu 01 Schema độc lập và 01 DbContext riêng biệt.
--   2. Chỉ sử dụng khóa ngoại vật lý (FOREIGN KEY) cho các bảng NẰM TRONG CÙNG 1 SCHEMA.
--   3. Giữa các bảng khác Schema chỉ lưu ID tham chiếu logic (UUID) và đồng bộ qua
--      In-Memory Event Bus nhằm đảm bảo tính cô lập tuyệt đối giữa các Module.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Khởi tạo 5 Schema độc lập tương ứng với 5 Module trong Backend .NET
CREATE SCHEMA IF NOT EXISTS biometrics;
CREATE SCHEMA IF NOT EXISTS attendance;
CREATE SCHEMA IF NOT EXISTS occupancy;
CREATE SCHEMA IF NOT EXISTS security;
CREATE SCHEMA IF NOT EXISTS reporting;

-- =============================================================================
-- 1. SCHEMA: biometrics (Quản lý bởi BiometricsDbContext)
--    Bao gồm: departments, employees, biometric_vectors
-- =============================================================================

CREATE TABLE IF NOT EXISTS biometrics.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_code VARCHAR(20) NOT NULL UNIQUE,
    department_name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS biometrics.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) UNIQUE,
    phone_number VARCHAR(20),
    department_id UUID NOT NULL REFERENCES biometrics.departments(id) ON DELETE RESTRICT,
    default_shift_id UUID, -- Tham chiếu logic sang attendance.shifts(id)
    avatar_object_key VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS biometrics.biometric_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES biometrics.employees(id) ON DELETE CASCADE,
    embedding_vector REAL[] NOT NULL,
    sample_image_key VARCHAR(255) NOT NULL,
    quality_score REAL NOT NULL DEFAULT 100.0,
    pose_Label VARCHAR(30) DEFAULT 'FRONTAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON biometrics.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_biometric_vectors_employee ON biometrics.biometric_vectors(employee_id);

-- =============================================================================
-- 2. SCHEMA: attendance (Quản lý bởi AttendanceDbContext)
--    Bao gồm: shifts, attendance_logs, leave_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_code VARCHAR(20) NOT NULL UNIQUE,
    shift_name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_minutes INT NOT NULL DEFAULT 15,
    lunch_start TIME NOT NULL DEFAULT '12:00:00',
    lunch_end TIME NOT NULL DEFAULT '13:30:00',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance.attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL, -- Tham chiếu logic sang biometrics.employees(id)
    employee_code VARCHAR(20) NOT NULL,
    shift_id UUID NOT NULL REFERENCES attendance.shifts(id) ON DELETE RESTRICT,
    gate_camera_id UUID,       -- Tham chiếu logic sang occupancy.cameras(id)
    work_date DATE NOT NULL,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    last_seen_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ON_TIME', -- ON_TIME, LATE, EARLY_LEAVE, ABSENT
    late_minutes INT NOT NULL DEFAULT 0,
    early_leave_minutes INT NOT NULL DEFAULT 0,
    match_confidence REAL NOT NULL DEFAULT 0.0,
    checkin_snapshot_key VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT uq_attendance_employee_date UNIQUE (employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS attendance.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL, -- Tham chiếu logic sang biometrics.employees(id)
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    leave_type VARCHAR(30) NOT NULL DEFAULT 'ANNUAL_LEAVE',
    reason VARCHAR(255),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED', -- PENDING, APPROVED, REJECTED
    approved_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_work_date ON attendance.attendance_logs(work_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON attendance.leave_requests(employee_id, start_date, end_date);

-- =============================================================================
-- 3. SCHEMA: occupancy (Quản lý bởi OccupancyDbContext)
--    Bao gồm: cameras, seats, seat_occupancy_logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS occupancy.cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_code VARCHAR(30) NOT NULL UNIQUE,
    camera_name VARCHAR(100) NOT NULL,
    camera_type VARCHAR(20) NOT NULL DEFAULT 'DESK', -- GATE, DESK
    department_id UUID, -- Tham chiếu logic sang biometrics.departments(id)
    stream_source VARCHAR(500) NOT NULL,
    calibration_frame_key VARCHAR(255),
    is_online BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS occupancy.seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seat_code VARCHAR(30) NOT NULL UNIQUE,
    seat_name VARCHAR(100) NOT NULL,
    zone_type VARCHAR(30) NOT NULL DEFAULT 'WORK_DESK', -- WORK_DESK, RESTRICTED_ZONE
    camera_id UUID NOT NULL REFERENCES occupancy.cameras(id) ON DELETE CASCADE,
    department_id UUID NOT NULL,        -- Tham chiếu logic sang biometrics.departments(id)
    assigned_employee_id UUID,          -- Tham chiếu logic sang biometrics.employees(id)
    polygon_points JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_state VARCHAR(20) NOT NULL DEFAULT 'EMPTY', -- EMPTY, PRESENT, TEMP_AWAY, PROLONGED_AWAY, WRONG_SEAT
    active_seconds_today INT NOT NULL DEFAULT 0,
    state_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS occupancy.seat_occupancy_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seat_id UUID NOT NULL REFERENCES occupancy.seats(id) ON DELETE CASCADE,
    detected_employee_id UUID,
    previous_state VARCHAR(20) NOT NULL,
    new_state VARCHAR(20) NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seats_camera ON occupancy.seats(camera_id);
CREATE INDEX IF NOT EXISTS idx_seats_department ON occupancy.seats(department_id);
CREATE INDEX IF NOT EXISTS idx_seat_logs_seat_time ON occupancy.seat_occupancy_logs(seat_id, recorded_at DESC);

-- =============================================================================
-- 4. SCHEMA: security (Quản lý bởi SecurityDbContext)
--    Bao gồm: ot_registrations, security_incidents
-- =============================================================================

CREATE TABLE IF NOT EXISTS security.ot_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL, -- Tham chiếu logic sang biometrics.employees(id)
    employee_code VARCHAR(20) NOT NULL,
    ot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reason VARCHAR(255),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    approved_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security.security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID NOT NULL,           -- Tham chiếu logic sang occupancy.cameras(id)
    detected_employee_id UUID,         -- NULL nếu là người lạ (UNKNOWN)
    alert_level VARCHAR(30) NOT NULL,  -- LEVEL_1_OT, LEVEL_2_UNAUTH, LEVEL_3_BREACH, SPOOFING_ATTEMPT
    snapshot_object_key VARCHAR(255) NOT NULL,
    video_clip_object_key VARCHAR(255),
    telegram_sent BOOLEAN NOT NULL DEFAULT FALSE,
    ticket_status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, FALSE_ALARM
    resolution_note TEXT,
    resolved_by_user_id UUID,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ot_registrations_date ON security.ot_registrations(ot_date, employee_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON security.security_incidents(ticket_status, detected_at DESC);

-- =============================================================================
-- 5. SCHEMA: reporting (Quản lý bởi ReportingDbContext)
--    Bao gồm: users, daily_department_summaries (Read-Model tổng hợp qua Event Bus)
-- =============================================================================

CREATE TABLE IF NOT EXISTS reporting.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'HR', -- ADMIN, HR, DEPT_LEAD, SECURITY
    department_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reporting.daily_department_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date DATE NOT NULL,
    department_id UUID NOT NULL,
    department_code VARCHAR(20) NOT NULL,
    total_employees INT NOT NULL DEFAULT 0,
    present_count INT NOT NULL DEFAULT 0,
    late_count INT NOT NULL DEFAULT 0,
    absent_count INT NOT NULL DEFAULT 0,
    prolonged_away_events INT NOT NULL DEFAULT 0,
    security_alerts_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_summary_date_dept UNIQUE (summary_date, department_id)
);

-- =============================================================================
-- 6. DỮ LIỆU KHỞI TẠO MẪU (SEED DATA PHỤC VỤ KIỂM THỬ)
-- =============================================================================

INSERT INTO biometrics.departments (id, department_code, department_name, description)
VALUES
    ('11111111-1111-1111-1111-111111111101', 'DEPT_IT', 'Phòng Kỹ thuật Phần mềm & AI', 'Phát triển hệ thống và vận hành hạ tầng'),
    ('11111111-1111-1111-1111-111111111102', 'DEPT_HR', 'Phòng Hành chính Nhân sự', 'Quản trị nhân sự và tổng hợp bảng công')
ON CONFLICT (department_code) DO NOTHING;

INSERT INTO attendance.shifts (id, shift_code, shift_name, start_time, end_time, grace_minutes, lunch_start, lunch_end, is_default)
VALUES
    ('22222222-2222-2222-2222-222222222201', 'SHIFT_HC', 'Ca Hành chính Tiêu chuẩn', '08:00:00', '17:30:00', 15, '12:00:00', '13:30:00', TRUE)
ON CONFLICT (shift_code) DO NOTHING;

INSERT INTO occupancy.cameras (id, camera_code, camera_name, camera_type, department_id, stream_source, is_online)
VALUES
    ('33333333-3333-3333-3333-333333333301', 'CAM_GATE_01', 'Camera Cửa Sảnh Chính', 'GATE', '11111111-1111-1111-1111-111111111101', 'rtsp://localhost:8554/gate01', TRUE),
    ('33333333-3333-3333-3333-333333333302', 'CAM_DESK_IT', 'Camera Phòng Kỹ thuật', 'DESK', '11111111-1111-1111-1111-111111111101', 'rtsp://localhost:8554/desk_it', TRUE)
ON CONFLICT (camera_code) DO NOTHING;
-- =============================================================================
-- SCRIPT KHỞI TẠO CƠ SỞ DỮ LIỆU PHÂN RÃ SCHEMA CHO KIẾN TRÚC MODULAR MONOLITH
-- Học phần: Đồ án Phát triển Ứng dụng phía Máy chủ Nâng cao (608819)
-- Hệ quản trị CSDL: PostgreSQL 16
-- Nguyên tắc Modular Monolith:
--   1. Mỗi Module sở hữu 01 Schema độc lập và 01 DbContext riêng biệt.
--   2. Chỉ sử dụng khóa ngoại vật lý (FOREIGN KEY) cho các bảng NẰM TRONG CÙNG 1 SCHEMA.
--   3. Giữa các bảng khác Schema chỉ lưu ID tham chiếu logic (UUID) và đồng bộ qua
--      In-Memory Event Bus nhằm đảm bảo tính cô lập tuyệt đối giữa các Module.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Khởi tạo 5 Schema độc lập tương ứng với 5 Module trong Backend .NET
CREATE SCHEMA IF NOT EXISTS biometrics;
CREATE SCHEMA IF NOT EXISTS attendance;
CREATE SCHEMA IF NOT EXISTS occupancy;
CREATE SCHEMA IF NOT EXISTS security;
CREATE SCHEMA IF NOT EXISTS reporting;

-- =============================================================================
-- 1. SCHEMA: biometrics (Quản lý bởi BiometricsDbContext)
--    Bao gồm: departments, employees, biometric_vectors
-- =============================================================================

CREATE TABLE IF NOT EXISTS biometrics.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_code VARCHAR(20) NOT NULL UNIQUE,
    department_name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS biometrics.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) UNIQUE,
    phone_number VARCHAR(20),
    department_id UUID NOT NULL REFERENCES biometrics.departments(id) ON DELETE RESTRICT,
    default_shift_id UUID, -- Tham chiếu logic sang attendance.shifts(id)
    avatar_object_key VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS biometrics.biometric_vectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES biometrics.employees(id) ON DELETE CASCADE,
    embedding_vector REAL[] NOT NULL,
    sample_image_key VARCHAR(255) NOT NULL,
    quality_score REAL NOT NULL DEFAULT 100.0,
    pose_Label VARCHAR(30) DEFAULT 'FRONTAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON biometrics.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_biometric_vectors_employee ON biometrics.biometric_vectors(employee_id);

-- =============================================================================
-- 2. SCHEMA: attendance (Quản lý bởi AttendanceDbContext)
--    Bao gồm: shifts, attendance_logs, leave_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_code VARCHAR(20) NOT NULL UNIQUE,
    shift_name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_minutes INT NOT NULL DEFAULT 15,
    lunch_start TIME NOT NULL DEFAULT '12:00:00',
    lunch_end TIME NOT NULL DEFAULT '13:30:00',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance.attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL, -- Tham chiếu logic sang biometrics.employees(id)
    employee_code VARCHAR(20) NOT NULL,
    shift_id UUID NOT NULL REFERENCES attendance.shifts(id) ON DELETE RESTRICT,
    gate_camera_id UUID,       -- Tham chiếu logic sang occupancy.cameras(id)
    work_date DATE NOT NULL,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    last_seen_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ON_TIME', -- ON_TIME, LATE, EARLY_LEAVE, ABSENT
    late_minutes INT NOT NULL DEFAULT 0,
    early_leave_minutes INT NOT NULL DEFAULT 0,
    match_confidence REAL NOT NULL DEFAULT 0.0,
    checkin_snapshot_key VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT uq_attendance_employee_date UNIQUE (employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS attendance.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL, -- Tham chiếu logic sang biometrics.employees(id)
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    leave_type VARCHAR(30) NOT NULL DEFAULT 'ANNUAL_LEAVE',
    reason VARCHAR(255),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED', -- PENDING, APPROVED, REJECTED
    approved_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_work_date ON attendance.attendance_logs(work_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON attendance.leave_requests(employee_id, start_date, end_date);

-- =============================================================================
-- 3. SCHEMA: occupancy (Quản lý bởi OccupancyDbContext)
--    Bao gồm: cameras, seats, seat_occupancy_logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS occupancy.cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_code VARCHAR(30) NOT NULL UNIQUE,
    camera_name VARCHAR(100) NOT NULL,
    camera_type VARCHAR(20) NOT NULL DEFAULT 'DESK', -- GATE, DESK
    department_id UUID, -- Tham chiếu logic sang biometrics.departments(id)
    stream_source VARCHAR(500) NOT NULL,
    calibration_frame_key VARCHAR(255),
    is_online BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS occupancy.seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seat_code VARCHAR(30) NOT NULL UNIQUE,
    seat_name VARCHAR(100) NOT NULL,
    zone_type VARCHAR(30) NOT NULL DEFAULT 'WORK_DESK', -- WORK_DESK, RESTRICTED_ZONE
    camera_id UUID NOT NULL REFERENCES occupancy.cameras(id) ON DELETE CASCADE,
    department_id UUID NOT NULL,        -- Tham chiếu logic sang biometrics.departments(id)
    assigned_employee_id UUID,          -- Tham chiếu logic sang biometrics.employees(id)
    polygon_points JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_state VARCHAR(20) NOT NULL DEFAULT 'EMPTY', -- EMPTY, PRESENT, TEMP_AWAY, PROLONGED_AWAY, WRONG_SEAT
    active_seconds_today INT NOT NULL DEFAULT 0,
    state_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS occupancy.seat_occupancy_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seat_id UUID NOT NULL REFERENCES occupancy.seats(id) ON DELETE CASCADE,
    detected_employee_id UUID,
    previous_state VARCHAR(20) NOT NULL,
    new_state VARCHAR(20) NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seats_camera ON occupancy.seats(camera_id);
CREATE INDEX IF NOT EXISTS idx_seats_department ON occupancy.seats(department_id);
CREATE INDEX IF NOT EXISTS idx_seat_logs_seat_time ON occupancy.seat_occupancy_logs(seat_id, recorded_at DESC);

-- =============================================================================
-- 4. SCHEMA: security (Quản lý bởi SecurityDbContext)
--    Bao gồm: ot_registrations, security_incidents
-- =============================================================================

CREATE TABLE IF NOT EXISTS security.ot_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL, -- Tham chiếu logic sang biometrics.employees(id)
    employee_code VARCHAR(20) NOT NULL,
    ot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reason VARCHAR(255),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    approved_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security.security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID NOT NULL,           -- Tham chiếu logic sang occupancy.cameras(id)
    detected_employee_id UUID,         -- NULL nếu là người lạ (UNKNOWN)
    alert_level VARCHAR(30) NOT NULL,  -- LEVEL_1_OT, LEVEL_2_UNAUTH, LEVEL_3_BREACH, SPOOFING_ATTEMPT
    snapshot_object_key VARCHAR(255) NOT NULL,
    video_clip_object_key VARCHAR(255),
    telegram_sent BOOLEAN NOT NULL DEFAULT FALSE,
    ticket_status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, FALSE_ALARM
    resolution_note TEXT,
    resolved_by_user_id UUID,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ot_registrations_date ON security.ot_registrations(ot_date, employee_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON security.security_incidents(ticket_status, detected_at DESC);

-- =============================================================================
-- 5. SCHEMA: reporting (Quản lý bởi ReportingDbContext)
--    Bao gồm: users, daily_department_summaries (Read-Model tổng hợp qua Event Bus)
-- =============================================================================

CREATE TABLE IF NOT EXISTS reporting.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'HR', -- ADMIN, HR, DEPT_LEAD, SECURITY
    department_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reporting.daily_department_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date DATE NOT NULL,
    department_id UUID NOT NULL,
    department_code VARCHAR(20) NOT NULL,
    total_employees INT NOT NULL DEFAULT 0,
    present_count INT NOT NULL DEFAULT 0,
    late_count INT NOT NULL DEFAULT 0,
    absent_count INT NOT NULL DEFAULT 0,
    prolonged_away_events INT NOT NULL DEFAULT 0,
    security_alerts_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_summary_date_dept UNIQUE (summary_date, department_id)
);

-- =============================================================================
-- 6. DỮ LIỆU KHỞI TẠO MẪU (SEED DATA PHỤC VỤ KIỂM THỬ)
-- =============================================================================

INSERT INTO biometrics.departments (id, department_code, department_name, description)
VALUES
    ('11111111-1111-1111-1111-111111111101', 'DEPT_IT', 'Phòng Kỹ thuật Phần mềm & AI', 'Phát triển hệ thống và vận hành hạ tầng'),
    ('11111111-1111-1111-1111-111111111102', 'DEPT_HR', 'Phòng Hành chính Nhân sự', 'Quản trị nhân sự và tổng hợp bảng công')
ON CONFLICT (department_code) DO NOTHING;

INSERT INTO attendance.shifts (id, shift_code, shift_name, start_time, end_time, grace_minutes, lunch_start, lunch_end, is_default)
VALUES
    ('22222222-2222-2222-2222-222222222201', 'SHIFT_HC', 'Ca Hành chính Tiêu chuẩn', '08:00:00', '17:30:00', 15, '12:00:00', '13:30:00', TRUE)
ON CONFLICT (shift_code) DO NOTHING;

INSERT INTO occupancy.cameras (id, camera_code, camera_name, camera_type, department_id, stream_source, is_online)
VALUES
    ('33333333-3333-3333-3333-333333333301', 'CAM_GATE_01', 'Camera Cửa Sảnh Chính', 'GATE', '11111111-1111-1111-1111-111111111101', 'rtsp://localhost:8554/gate01', TRUE),
    ('33333333-3333-3333-3333-333333333302', 'CAM_DESK_IT', 'Camera Phòng Kỹ thuật', 'DESK', '11111111-1111-1111-1111-111111111101', 'rtsp://localhost:8554/desk_it', TRUE)
ON CONFLICT (camera_code) DO NOTHING;

