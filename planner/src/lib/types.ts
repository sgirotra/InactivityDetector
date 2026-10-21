// Serializable shapes shared by server and client. Dates are Eastern-local
// "YYYY-MM-DD", times are 24h "HH:MM", timestamps are ISO strings.

export const DEFAULT_AREAS = ["Coursework", "Recruiting & side", "Clubs & open questions"] as const;

export interface Section {
  id: string;
  area: string;
  name: string;
  credits: number | null;
  aliases: string;
  order: number;
  archived: boolean;
}

export interface Task {
  id: string;
  sectionId: string;
  title: string;
  note: string | null;
  due: string | null;
  dueTime: string | null;
  priority: number | null;
  order: number;
  completedAt: string | null;
  createdAt: string;
}

export interface RecurringBlock {
  id: string;
  weekday: number;
  start: string;
  end: string;
  name: string;
  kind: string;
  survivesDaysOff: boolean;
  activeFrom: string | null;
  activeUntil: string | null;
}

export interface CalEvent {
  id: string;
  date: string;
  start: string | null;
  end: string | null;
  title: string;
  category: string;
  note: string | null;
  completedAt: string | null;
}

export interface DayOff {
  date: string;
  label: string;
}

export interface BlockSkip {
  id: string;
  date: string;
  blockId: string | null;
  blockName: string | null;
}

export interface FocusItem {
  id: string;
  listDate: string;
  title: string;
  note: string | null;
  linkedTaskId: string | null;
  order: number;
  completedAt: string | null;
}

export interface FocusList {
  date: string;
  label: string | null;
  items: FocusItem[];
}

export interface ClashNote {
  id: string;
  date: string;
  text: string;
}

export interface PlannerState {
  sections: Section[];
  tasks: Task[];
  blocks: RecurringBlock[];
  events: CalEvent[];
  daysOff: DayOff[];
  skips: BlockSkip[];
  focusLists: FocusList[];
  clashNotes: ClashNote[];
}
