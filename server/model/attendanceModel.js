const mongoose = require("mongoose");

// Sub-schema for individual daily records
const DailyAttendanceSchema = new mongoose.Schema({
  day: {
    type: Number,
    required: true
  },
  date: {
    type: Date
  },
  status: {
    type: String,
    default: "Absent",
    enum: ["Present", "Absent", "Missed Punch", "Weekend", "Holiday", "Leave", "Site Visit"]
  },
  inTime: {
    type: String,
    default: null
  },
  outTime: {
    type: String,
    default: null
  },
  totalHours: {
    type: Number,
    default: 0
  },
  times: {
    type: [String],
    default: []
  },
  overtime: {
    type: Number,
    default: 0
  },
  leaveType: {
    type: String,
    default: null
  },
  holidayName: {
    type: String,
    default: null
  }

}, { _id: false }); // Disable auto-generating _id for sub-documents to save space

// Main Schema for the Monthly Report
const AttendanceSchema = new mongoose.Schema({
  employeeId: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  month: {
    type: Number,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  totalMonthlyHours: {
    type: Number,
    default: 0
  },
  totalMonthlyOvertime: {
    type: Number,
    default: 0
  },
  // The array of daily logs
  attendance: [DailyAttendanceSchema]
}, {
  timestamps: true // Adds createdAt and updatedAt timestamps automatically
});

// ✅ Compound Index: Ensures one report per employee per month per year.
// This makes your 'upsert' logic in the script extremely fast.
AttendanceSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", AttendanceSchema);
