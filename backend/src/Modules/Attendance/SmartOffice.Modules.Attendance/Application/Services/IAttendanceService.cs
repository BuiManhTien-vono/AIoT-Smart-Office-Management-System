using SmartOffice.Modules.Attendance.Application.DTOs;
using SmartOffice.SharedKernel.Common;

namespace SmartOffice.Modules.Attendance.Application.Services;

public interface IAttendanceService
{
    Task<Result<ShiftResponse>> CreateShiftAsync(CreateShiftRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<ShiftResponse>> GetShiftsAsync(CancellationToken ct = default);

    Task<Result<AttendanceRecordResponse>> ProcessCheckInOutAsync(CheckAttendanceRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<AttendanceRecordResponse>> GetDailyAttendanceLogsAsync(DateOnly? workDate = null, CancellationToken ct = default);

    Task<Result<LeaveRequestResponse>> CreateLeaveRequestAsync(CreateLeaveRequestDto request, CancellationToken ct = default);
    Task<IReadOnlyList<LeaveRequestResponse>> GetLeaveRequestsAsync(DateOnly? date = null, CancellationToken ct = default);
}
