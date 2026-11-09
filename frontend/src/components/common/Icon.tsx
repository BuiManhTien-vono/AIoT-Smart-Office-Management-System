import {
  ArrowClockwiseIcon, ArrowRightIcon, BellIcon, BuildingsIcon,
  CalendarCheckIcon, CaretDoubleLeftIcon, CaretDoubleRightIcon, ChartBarIcon, CheckCircleIcon,
  ClockIcon, IdentificationCardIcon, ListIcon, CameraIcon, ShieldCheckIcon,
  SignOutIcon, SquaresFourIcon, TrashIcon, UserPlusIcon, WarningCircleIcon, UsersThreeIcon, XIcon, ArmchairIcon,
} from '@phosphor-icons/react'

const icons = {
  overview: SquaresFourIcon,
  seatMap: ArmchairIcon,
  reports: ChartBarIcon,
  users: UsersThreeIcon,
  office: BuildingsIcon,
  bell: BellIcon,
  clock: ClockIcon,
  collapse: CaretDoubleLeftIcon,
  expand: CaretDoubleRightIcon,
  menu: ListIcon,
  close: XIcon,
  logout: SignOutIcon,
  refresh: ArrowClockwiseIcon,
  arrow: ArrowRightIcon,
  check: CheckCircleIcon,
  identification: IdentificationCardIcon,
  calendar: CalendarCheckIcon,
  camera: CameraIcon,
  trash: TrashIcon,
  userPlus: UserPlusIcon,
  shieldCheck: ShieldCheckIcon,
  warning: WarningCircleIcon,
}

export type IconName = keyof typeof icons

export function Icon({ name, size = 20, className, style }: {
  name: IconName
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  const Component = icons[name]
  return <Component size={size} weight="regular" className={className} style={style} aria-hidden="true" />
}
