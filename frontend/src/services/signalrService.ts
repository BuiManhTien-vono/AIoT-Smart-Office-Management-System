import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr'
import type {
  SeatStateChangedEvent,
  ProlongedAbsenceAlertEvent,
  WrongSeatAlertEvent,
} from '../types/occupancy.types'

const configuredBase = (import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5155').replace(/\/+$/, '')
const backendBase = configuredBase.replace(/\/api\/v1$/i, '')

function resolveHubUrl(): string {
  if (typeof window !== 'undefined' && (window.location.port === '' || window.location.port === '80')) {
    return '/hubs/occupancy'
  }
  return `${backendBase}/hubs/occupancy`
}

export type ConnectionStateListener = (state: HubConnectionState) => void
export type SeatStateListener = (event: SeatStateChangedEvent) => void
export type ProlongedAbsenceListener = (event: ProlongedAbsenceAlertEvent) => void
export type WrongSeatListener = (event: WrongSeatAlertEvent) => void

export interface AttendanceRecordedEvent {
  eventId: string
  occurredOnUtc: string
  attendanceLogId: string
  employeeId: string
  employeeCode: string
  departmentId: string
  workDate: string
  status: string
  lateMinutes: number
  isFirstCheckInOfDay: boolean
}
export type AttendanceRecordedListener = (event: AttendanceRecordedEvent) => void

export interface SecurityAlertEvent {
  eventId: string
  occurredOnUtc: string
  incidentId: string
  cameraId: string
  departmentId?: string
  detectedEmployeeId?: string
  alertLevel: string
  incidentType?: string
  description?: string
}
export type SecurityAlertListener = (event: SecurityAlertEvent) => void

export class OccupancySignalRService {
  private connection: HubConnection | null = null
  private stateListeners = new Set<ConnectionStateListener>()
  private seatStateListeners = new Set<SeatStateListener>()
  private prolongedAbsenceListeners = new Set<ProlongedAbsenceListener>()
  private wrongSeatListeners = new Set<WrongSeatListener>()
  private attendanceRecordedListeners = new Set<AttendanceRecordedListener>()
  private securityAlertListeners = new Set<SecurityAlertListener>()
  private activeToken: string | null = null

  public getConnectionState(): HubConnectionState {
    return this.connection?.state ?? HubConnectionState.Disconnected
  }

  public async start(token?: string): Promise<void> {
    if (token) {
      this.activeToken = token
    }

    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      return
    }

    if (this.connection && this.connection.state === HubConnectionState.Connecting) {
      return
    }

    const hubUrl = resolveHubUrl()

    this.connection = new HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => this.activeToken || '',
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build()

    this.connection.onreconnecting(() => {
      this.notifyState(HubConnectionState.Reconnecting)
    })

    this.connection.onreconnected(() => {
      this.notifyState(HubConnectionState.Connected)
    })

    this.connection.onclose(() => {
      this.notifyState(HubConnectionState.Disconnected)
    })

    // Lắng nghe sự kiện SeatStateChanged
    this.connection.on('SeatStateChanged', (event: SeatStateChangedEvent) => {
      this.seatStateListeners.forEach(listener => {
        try {
          listener(event)
        } catch (err) {
          console.error('[SignalR] Error in seatStateListener', err)
        }
      })
    })

    // Lắng nghe sự kiện ProlongedAbsenceAlert
    this.connection.on('ProlongedAbsenceAlert', (event: ProlongedAbsenceAlertEvent) => {
      this.prolongedAbsenceListeners.forEach(listener => {
        try {
          listener(event)
        } catch (err) {
          console.error('[SignalR] Error in prolongedAbsenceListener', err)
        }
      })
    })

    // Lắng nghe sự kiện WrongSeatAlert
    this.connection.on('WrongSeatAlert', (event: WrongSeatAlertEvent) => {
      this.wrongSeatListeners.forEach(listener => {
        try {
          listener(event)
        } catch (err) {
          console.error('[SignalR] Error in wrongSeatListener', err)
        }
      })
    })

    // Lắng nghe sự kiện AttendanceRecorded (Chấm công vào/ra ca, chốt vắng mặt)
    this.connection.on('AttendanceRecorded', (event: AttendanceRecordedEvent) => {
      this.attendanceRecordedListeners.forEach(listener => {
        try {
          listener(event)
        } catch (err) {
          console.error('[SignalR] Error in attendanceRecordedListener', err)
        }
      })
    })

    // Lắng nghe sự kiện SecurityAlert (Cảnh báo an ninh SOC)
    this.connection.on('SecurityAlert', (event: SecurityAlertEvent) => {
      this.securityAlertListeners.forEach(listener => {
        try {
          listener(event)
        } catch (err) {
          console.error('[SignalR] Error in securityAlertListener', err)
        }
      })
    })

    try {
      await this.connection.start()
      this.notifyState(HubConnectionState.Connected)
    } catch (err) {
      this.notifyState(HubConnectionState.Disconnected)
      console.warn('[SignalR] Could not connect to OccupancyHub:', err)
      throw err
    }
  }

  public async stop(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.stop()
      } catch {
        // Ignored on teardown
      } finally {
        this.connection = null
        this.notifyState(HubConnectionState.Disconnected)
      }
    }
  }

  public async joinDepartmentGroup(departmentId: string): Promise<void> {
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      try {
        await this.connection.invoke('JoinDepartmentGroup', departmentId)
      } catch (err) {
        console.warn(`[SignalR] Failed to join department group ${departmentId}:`, err)
      }
    }
  }

  public async leaveDepartmentGroup(departmentId: string): Promise<void> {
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      try {
        await this.connection.invoke('LeaveDepartmentGroup', departmentId)
      } catch (err) {
        console.warn(`[SignalR] Failed to leave department group ${departmentId}:`, err)
      }
    }
  }

  public async joinOverviewGroup(role: string = 'ADMIN'): Promise<void> {
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      try {
        await this.connection.invoke('JoinOverviewGroup', role)
      } catch (err) {
        console.warn(`[SignalR] Failed to join overview group role ${role}:`, err)
      }
    }
  }

  public onConnectionState(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.getConnectionState())
    return () => this.stateListeners.delete(listener)
  }

  public onSeatStateChanged(listener: SeatStateListener): () => void {
    this.seatStateListeners.add(listener)
    return () => this.seatStateListeners.delete(listener)
  }

  public onProlongedAbsence(listener: ProlongedAbsenceListener): () => void {
    this.prolongedAbsenceListeners.add(listener)
    return () => this.prolongedAbsenceListeners.delete(listener)
  }

  public onWrongSeat(listener: WrongSeatListener): () => void {
    this.wrongSeatListeners.add(listener)
    return () => this.wrongSeatListeners.delete(listener)
  }

  public onAttendanceRecorded(listener: AttendanceRecordedListener): () => void {
    this.attendanceRecordedListeners.add(listener)
    return () => this.attendanceRecordedListeners.delete(listener)
  }

  public onSecurityAlert(listener: SecurityAlertListener): () => void {
    this.securityAlertListeners.add(listener)
    return () => this.securityAlertListeners.delete(listener)
  }

  private notifyState(state: HubConnectionState): void {
    this.stateListeners.forEach(listener => {
      try {
        listener(state)
      } catch (err) {
        console.error('[SignalR] Error in stateListener', err)
      }
    })
  }
}

// Singleton instance dùng chung toàn ứng dụng
export const signalrService = new OccupancySignalRService()
