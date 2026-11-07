import {
  ArrowClockwiseIcon, ArrowRightIcon, BellIcon, BuildingsIcon,
  CaretDoubleLeftIcon, CaretDoubleRightIcon, ChartBarIcon, CheckCircleIcon,
  ClockIcon, ListIcon, SignOutIcon, SquaresFourIcon, UsersThreeIcon, XIcon,
} from '@phosphor-icons/react'

const icons = {
  overview: SquaresFourIcon,
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
}

export type IconName = keyof typeof icons

export function Icon({ name, size = 20, className }: {
  name: IconName
  size?: number
  className?: string
}) {
  const Component = icons[name]
  return <Component size={size} weight="regular" className={className} aria-hidden="true" />
}
