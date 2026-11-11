using SmartOffice.SharedKernel.Common;

namespace SmartOffice.Modules.Occupancy.Domain;

/// <summary>
/// Máy trạng thái hữu hạn chỗ ngồi (4-State FSM + WRONG_SEAT) theo đặc tả FR-OCC-02..05:
/// - EMPTY: Bàn trống chưa phân bổ hoặc chưa bắt đầu phiên làm việc.
/// - PRESENT: Có người ngồi đúng vị trí -> cộng dồn thời gian làm việc tích cực (ActiveSecondsToday).
/// - TEMP_AWAY: Rời bàn liên tục >= 3s (15 frames) và < 15 phút (900s).
/// - PROLONGED_AWAY: Rời bàn liên tục >= 15 phút (900s) ngoài khung giờ nghỉ trưa (12:00 - 13:30).
/// - WRONG_SEAT: Phát hiện nhân viên ngồi nhầm bàn đã phân bổ cho nhân viên khác.
/// </summary>
public static class SeatStateMachine
{
    public const string StateEmpty = "EMPTY";
    public const string StatePresent = "PRESENT";
    public const string StateTempAway = "TEMP_AWAY";
    public const string StateProlongedAway = "PROLONGED_AWAY";
    public const string StateWrongSeat = "WRONG_SEAT";

    public const int AntiFlickerMinFrames = 15;
    public const int AntiFlickerMinSeconds = 3;
    public const int DefaultProlongedAbsenceSeconds = 900; // 15 phút

    public static readonly TimeOnly DefaultLunchStart = new(12, 0);
    public static readonly TimeOnly DefaultLunchEnd = new(13, 30);

    public sealed record StateEvaluationContext(
        string CurrentState,
        DateTimeOffset StateUpdatedAtUtc,
        int CurrentActiveSecondsToday,
        Guid? AssignedEmployeeId,
        bool IsOccupied,
        int UnoccupiedContinuousFrames,
        int UnoccupiedContinuousSeconds,
        Guid? DetectedEmployeeId,
        DateTimeOffset CapturedAtUtc,
        int ProlongedAbsenceThresholdSeconds = DefaultProlongedAbsenceSeconds,
        TimeOnly? LunchStart = null,
        TimeOnly? LunchEnd = null);

    public sealed record StateEvaluationOutcome(
        string PreviousState,
        string NewState,
        bool StateChanged,
        bool IsIgnoredOutOfOrder,
        int PreviousStateDurationSeconds,
        int UpdatedActiveSecondsToday,
        DateTimeOffset UpdatedStateTimestampUtc,
        bool IsLunchMuted,
        bool ProlongedAbsenceAlertTriggered,
        bool WrongSeatAlertTriggered,
        string Message);

    public static StateEvaluationOutcome Evaluate(StateEvaluationContext ctx)
    {
        var prevState = string.IsNullOrWhiteSpace(ctx.CurrentState)
            ? StateEmpty
            : ctx.CurrentState.Trim().ToUpperInvariant();

        // 1. Bảo vệ chống sự kiện đến trễ / out-of-order (khi bàn đã bắt đầu phiên theo dõi)
        var elapsedSecondsRaw = (ctx.CapturedAtUtc - ctx.StateUpdatedAtUtc).TotalSeconds;
        if (elapsedSecondsRaw < 0 && prevState != StateEmpty)
        {
            return new StateEvaluationOutcome(
                PreviousState: prevState,
                NewState: prevState,
                StateChanged: false,
                IsIgnoredOutOfOrder: true,
                PreviousStateDurationSeconds: 0,
                UpdatedActiveSecondsToday: ctx.CurrentActiveSecondsToday,
                UpdatedStateTimestampUtc: ctx.StateUpdatedAtUtc,
                IsLunchMuted: false,
                ProlongedAbsenceAlertTriggered: false,
                WrongSeatAlertTriggered: false,
                Message: "Bỏ qua sự kiện đến trễ (capturedAtUtc < stateUpdatedAt).");
        }

        var elapsedSeconds = Math.Max(0, (int)Math.Floor(elapsedSecondsRaw));
        var lunchStart = ctx.LunchStart ?? DefaultLunchStart;
        var lunchEnd = ctx.LunchEnd ?? DefaultLunchEnd;
        var currentTimeOfDay = TimeOnly.FromDateTime(ctx.CapturedAtUtc.DateTime);
        var isLunchWindow = currentTimeOfDay >= lunchStart && currentTimeOfDay <= lunchEnd;

        // 2. Trường hợp CÓ NGƯỜI NGỒI TẠI BÀN (IsOccupied == true)
        if (ctx.IsOccupied)
        {
            bool isWrongSeat = ctx.AssignedEmployeeId.HasValue &&
                               ctx.DetectedEmployeeId.HasValue &&
                               ctx.DetectedEmployeeId.Value != ctx.AssignedEmployeeId.Value;

            var targetOccupiedState = isWrongSeat ? StateWrongSeat : StatePresent;
            bool changed = !string.Equals(prevState, targetOccupiedState, StringComparison.OrdinalIgnoreCase);

            // Cộng dồn thời gian làm việc tích cực nếu đang ở PRESENT và tiếp tục PRESENT
            int updatedActiveSeconds = ctx.CurrentActiveSecondsToday;
            if (prevState == StatePresent && targetOccupiedState == StatePresent && elapsedSeconds > 0)
            {
                updatedActiveSeconds += elapsedSeconds;
            }

            bool triggerWrongSeatAlert = isWrongSeat && prevState != StateWrongSeat;

            return new StateEvaluationOutcome(
                PreviousState: prevState,
                NewState: targetOccupiedState,
                StateChanged: changed,
                IsIgnoredOutOfOrder: false,
                PreviousStateDurationSeconds: elapsedSeconds,
                UpdatedActiveSecondsToday: updatedActiveSeconds,
                UpdatedStateTimestampUtc: ctx.CapturedAtUtc,
                IsLunchMuted: isLunchWindow,
                ProlongedAbsenceAlertTriggered: false,
                WrongSeatAlertTriggered: triggerWrongSeatAlert,
                Message: isWrongSeat
                    ? "Cảnh báo ngồi sai vị trí đã phân bổ (WRONG_SEAT)."
                    : "Ghi nhận nhân viên đang hiện diện tại bàn (PRESENT).");
        }

        // 3. Trường hợp KHÔNG CÓ NGƯỜI TẠI BÀN (IsOccupied == false)
        // 3.1. Nếu bàn chưa gán nhân viên và đang EMPTY -> giữ nguyên EMPTY
        if (!ctx.AssignedEmployeeId.HasValue && prevState == StateEmpty)
        {
            return new StateEvaluationOutcome(
                PreviousState: StateEmpty,
                NewState: StateEmpty,
                StateChanged: false,
                IsIgnoredOutOfOrder: false,
                PreviousStateDurationSeconds: elapsedSeconds,
                UpdatedActiveSecondsToday: ctx.CurrentActiveSecondsToday,
                UpdatedStateTimestampUtc: ctx.StateUpdatedAtUtc,
                IsLunchMuted: isLunchWindow,
                ProlongedAbsenceAlertTriggered: false,
                WrongSeatAlertTriggered: false,
                Message: "Bàn trống chưa phân bổ nhân viên (EMPTY).");
        }

        // Tính tổng thời gian vắng mặt liên tục (lấy max giữa dữ liệu đo từ AI và khoảng thời gian từ lần cập nhật trước)
        int awaySeconds = Math.Max(ctx.UnoccupiedContinuousSeconds, elapsedSeconds);
        int awayFrames = ctx.UnoccupiedContinuousFrames;

        // 3.2. Bộ lọc chống nhấp nháy Anti-Flicker (FR-OCC-03):
        // Nếu đang ở PRESENT hoặc WRONG_SEAT mà mới mất tín hiệu < 3 giây VÀ < 15 frames -> Giữ nguyên trạng thái
        if ((prevState == StatePresent || prevState == StateWrongSeat) &&
            awaySeconds < AntiFlickerMinSeconds &&
            awayFrames < AntiFlickerMinFrames)
        {
            return new StateEvaluationOutcome(
                PreviousState: prevState,
                NewState: prevState,
                StateChanged: false,
                IsIgnoredOutOfOrder: false,
                PreviousStateDurationSeconds: awaySeconds,
                UpdatedActiveSecondsToday: ctx.CurrentActiveSecondsToday,
                UpdatedStateTimestampUtc: ctx.StateUpdatedAtUtc,
                IsLunchMuted: isLunchWindow,
                ProlongedAbsenceAlertTriggered: false,
                WrongSeatAlertTriggered: false,
                Message: $"Bộ lọc Anti-Flicker giữ nguyên trạng thái {prevState} (vắng {awaySeconds}s / {awayFrames} frames < ngưỡng 3s / 15 frames).");
        }

        // Nếu vừa rời khỏi trạng thái PRESENT, cộng dồn nốt thời gian làm việc tích cực của phiên PRESENT trước đó
        int activeSecondsAfterLeaving = ctx.CurrentActiveSecondsToday;

        // 3.3. Kiểm tra ngưỡng vắng mặt quá hạn >= 15 phút (900s) và Cơ chế Mute giờ nghỉ trưa (FR-OCC-04)
        var threshold = ctx.ProlongedAbsenceThresholdSeconds > 0
            ? ctx.ProlongedAbsenceThresholdSeconds
            : DefaultProlongedAbsenceSeconds;

        if (awaySeconds >= threshold)
        {
            if (isLunchWindow)
            {
                // Trong giờ nghỉ trưa (12:00 - 13:30): tạm ngắt chuyển sang PROLONGED_AWAY, giữ ở TEMP_AWAY
                bool changedToTempInLunch = prevState != StateTempAway;
                return new StateEvaluationOutcome(
                    PreviousState: prevState,
                    NewState: StateTempAway,
                    StateChanged: changedToTempInLunch,
                    IsIgnoredOutOfOrder: false,
                    PreviousStateDurationSeconds: awaySeconds,
                    UpdatedActiveSecondsToday: activeSecondsAfterLeaving,
                    UpdatedStateTimestampUtc: changedToTempInLunch ? ctx.CapturedAtUtc : ctx.StateUpdatedAtUtc,
                    IsLunchMuted: true,
                    ProlongedAbsenceAlertTriggered: false,
                    WrongSeatAlertTriggered: false,
                    Message: "Đang trong khung giờ nghỉ trưa (12:00 - 13:30): Tạm ngắt cảnh báo vắng mặt quá hạn (Lunchtime Mute).");
            }

            bool changedToProlonged = prevState != StateProlongedAway;
            return new StateEvaluationOutcome(
                PreviousState: prevState,
                NewState: StateProlongedAway,
                StateChanged: changedToProlonged,
                IsIgnoredOutOfOrder: false,
                PreviousStateDurationSeconds: awaySeconds,
                UpdatedActiveSecondsToday: activeSecondsAfterLeaving,
                UpdatedStateTimestampUtc: changedToProlonged ? ctx.CapturedAtUtc : ctx.StateUpdatedAtUtc,
                IsLunchMuted: false,
                ProlongedAbsenceAlertTriggered: changedToProlonged,
                WrongSeatAlertTriggered: false,
                Message: $"Cảnh báo vắng mặt quá hạn ({awaySeconds} giây >= {threshold} giây).");
        }

        // 3.4. Vắng mặt tạm thời (>= 3s/15 frames và < 15 phút) -> TEMP_AWAY
        bool changedToTemp = prevState != StateTempAway;
        return new StateEvaluationOutcome(
            PreviousState: prevState,
            NewState: StateTempAway,
            StateChanged: changedToTemp,
            IsIgnoredOutOfOrder: false,
            PreviousStateDurationSeconds: awaySeconds,
            UpdatedActiveSecondsToday: activeSecondsAfterLeaving,
            UpdatedStateTimestampUtc: changedToTemp ? ctx.CapturedAtUtc : ctx.StateUpdatedAtUtc,
            IsLunchMuted: isLunchWindow,
            ProlongedAbsenceAlertTriggered: false,
            WrongSeatAlertTriggered: false,
            Message: $"Nhân viên tạm rời vị trí làm việc ({awaySeconds} giây < {threshold} giây).");
    }
}

