export type AttendanceBreak = {
  start: Date;
  end?: Date;
};

export type AttendanceStatus = 'open' | 'closed' | 'correcting';

export type Attendance = {
  id: string;
  userId: string;
  storeId: string;
  clockIn: Date;
  clockOut?: Date;
  breaks: AttendanceBreak[];
  status: AttendanceStatus;
  createdAt: Date;
  updatedAt: Date;
};
