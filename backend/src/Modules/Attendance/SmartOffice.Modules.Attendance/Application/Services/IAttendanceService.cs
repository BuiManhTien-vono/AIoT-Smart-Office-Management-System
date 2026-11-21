using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.SharedKernel.Common;
using SmartOffice.SharedKernel.Security;

namespace SmartOffice.Modules.Attendance.Application.Services;

public interface IAttendanceService
{
    Task<Result<ShiftResponse>> CreateShiftAsync(CreateShiftRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<ShiftResponse>> GetShiftsAsync(CancellationToken ct = default);

    Task<Result<AttendanceRecordResponse>> ProcessCheckInOutAsync(CheckAttendanceRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<AttendanceRecordResponse>> GetDailyAttendanceLogsAsync(
        DateOnly? workDate = null,
        DateOnly? fromDate = null,
        DateOnly? toDate = null,
        CancellationToken ct = default);

    Task<Result<AttendanceRecordResponse>> AdjustAttendanceLogAsync(
        Guid attendanceLogId,
        AdjustAttendanceRequest request,
        ActorContext actor,
        CancellationToken ct = default);

    Task<Result<AttendanceRecordResponse>> CreateManualAttendanceLogAsync(
        ManualAttendanceRequest request,
        ActorContext actor,
        CancellationToken ct = default);

    Task<Result<CancelAttendanceResponse>> CancelAttendanceLogAsync(
        Guid attendanceLogId,
        CancelAttendanceRequest request,
        ActorContext actor,
        CancellationToken ct = default);

    Task<Result<IReadOnlyList<AttendanceAdjustmentAuditResponse>>> GetAttendanceAuditsAsync(
        ActorContext actor,
        Guid? employeeId = null,
        DateOnly? fromDate = null,
        DateOnly? toDate = null,
        CancellationToken ct = default);

    Task<Result<AttendanceSnapshotUploadResponse>> UploadAttendanceSnapshotAsync(
        Guid attendanceLogId,
        Stream fileStream,
        string contentType,
        CancellationToken ct = default);

    Task<Result<LeaveRequestResponse>> CreateLeaveRequestAsync(CreateLeaveRequestDto request, CancellationToken ct = default);
    Task<Result<LeaveRequestResponse>> CancelLeaveRequestAsync(Guid leaveRequestId, CancellationToken ct = default);
    Task<Result<LeaveRequestResponse>> ReplaceLeaveRequestAsync(Guid leaveRequestId, CreateLeaveRequestDto request, CancellationToken ct = default);
    Task<IReadOnlyList<LeaveRequestResponse>> GetLeaveRequestsAsync(DateOnly? date = null, CancellationToken ct = default);

    Task<Result<DailyAbsentProcessResponse>> MarkDailyAbsentEmployeesAsync(DateOnly? workDate = null, CancellationToken ct = default);
}
