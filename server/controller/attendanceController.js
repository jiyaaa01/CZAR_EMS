// const Attendance = require('../model/attendanceModel')
// const Employee = require('../model/employeeModel');

// // const createAttendance = async (req, res) => {
// //   try {
// //     const { attendanceData } = req.body;
// //     if (!attendanceData || !Array.isArray(attendanceData)) {
// //       return res.status(400).json({ message: "Invalid data format" });
// //     }
// //     // Optional: remove old month’s data before inserting new
// //     await Attendance.deleteMany({ month: "October-2025" });

// //     await Attendance.insertMany(attendanceData);
// //     res.status(201).json({ message: "Attendance uploaded successfully" });
// //   } catch (error) {
// //     console.error("Error uploading attendance:", error);
// //     res.status(500).json({ message: "Server error" });
// //   }
// // };


// // module.exports = {createAttendance};

// // ✅ CommonJS version (test.js) - Refined for MongoDB Schema
// const XLSX = require("xlsx");
// const fs = require("fs");
// const path = require("path");

// exports.uploadAttendance = async (req, res) => {
//   try {
//     const file = req.file;
//     const { month, year } = req.body;

//     if (!file || !month || !year) {
//       return res.status(400).json({ error: "File, month, and year are required." });
//     }

//     const FILE_PATH = file.path; // Use the uploaded file path
//     const TARGET_YEAR = parseInt(year);
//     const TARGET_MONTH = parseInt(month);

//     // Read workbook
//     const workbook = XLSX.readFile(FILE_PATH);
//     const sheetName = workbook.SheetNames[0];
//     const sheet = workbook.Sheets[sheetName];

//     // Convert to array of arrays
//     const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

//     // Skip the top 4 rows (titles + weekday row) to get to the header (days)
//     const headerRow = rawData[2];
//     const dataRows = rawData.slice(4);

//     // Clean headers (Get day numbers 1, 2, 3...)
//     const headers = headerRow.map((h) => (h ? h.toString().trim() : ""));

//     // --- Helper Functions ---
//     function parseTime(t) {
//       if (!t) return null;
//       const [h, m] = t.split(":").map(Number);
//       const d = new Date();
//       d.setHours(h, m, 0, 0);
//       return d;
//     }

//     // Calculates duration using only first & last time
//     function calculateHoursFirstLast(times) {
//       if (!times || times.length < 2) return 0;

//       const start = parseTime(times[0]);
//       const end = parseTime(times[times.length - 1]);

//       // Calculate difference in hours
//       const diff = (end - start) / (1000 * 60 * 60);

//       // Return positive value or 0 if invalid (e.g. overnight shifts not handled here)
//       return diff > 0 && diff < 24 ? +diff.toFixed(2) : 0;
//     }

//     // --- Build employee records ---
//     // Prepare lists
//     const employees = [];
//     const missingEmployees = [];

//     // Use Promise.all for DB lookups
//     await Promise.all(
//       dataRows
//         .filter((r) => r[0] && r[1])
//         .map(async (row) => {
//           const employeeId = row[0]?.toString().trim();
//           const name = row[1]?.toString().trim();
//           // Check if employee exists in DB
//           const dbEmployee = await Employee.findOne({ employeeId });
//           if (dbEmployee) {
//             // Build attendance record
//             const emp = {
//               employeeId,
//               name,
//               month: TARGET_MONTH,
//               year: TARGET_YEAR,
//               totalMonthlyHours: 0,
//               attendance: [],
//               dbData: dbEmployee // Add full DB data if needed
//             };
//             for (let i = 2; i < headers.length; i++) {
//               const dayRaw = headers[i];
//               if (!dayRaw || !/^\d+$/.test(dayRaw)) continue;
//               const dayNum = parseInt(dayRaw, 10);
//               const cell = row[i];
//               let dayRecord = {
//                 day: dayNum,
//                 status: "Absent",
//                 inTime: null,
//                 outTime: null,
//                 totalHours: 0,
//                 times: []
//               };
//               if (typeof cell === "string" && cell.trim() !== "") {
//                 const times = cell.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
//                 const totalHours = calculateHoursFirstLast(times);
//                 dayRecord.times = times;
//                 dayRecord.inTime = times[0] || null;
//                 dayRecord.outTime = times[times.length - 1] || null;
//                 dayRecord.totalHours = totalHours;
//                 if (totalHours > 0) {
//                   dayRecord.status = "Present";
//                 } else if (times.length === 1) {
//                   dayRecord.status = "Missed Punch";
//                 }
//                 emp.totalMonthlyHours += totalHours;
//               }
//               emp.attendance.push(dayRecord);
//             }
//             emp.totalMonthlyHours = +emp.totalMonthlyHours.toFixed(2);
//             employees.push(emp);
//           } else {
//             missingEmployees.push({ employeeId, name });
//           }
//         })
//     );

//     // Save found employees to database
//     await Attendance.insertMany(employees);

//     // If you want to keep the uploaded file, do not delete it
//     // fs.unlinkSync(FILE_PATH); // <-- Commented out to keep file

//     res.status(201).json({
//       message: "Attendance uploaded successfully",
//       count: employees.length,
//       missingEmployees
//     });
//   } catch (error) {
//     console.error("Error uploading attendance:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };


// exports.getAttendance = async (req, res) => {
//   try {
//     const { month, year } = req.query;

//     if (!month || !year) {
//       return res.status(400).json({ error: "Month and Year are required." });
//     }

//     // 1. Base Query: Always filter by the requested date
//     let query = { 
//       month: parseInt(month), 
//       year: parseInt(year) 
//     };

//     // 2. CHECK ROLE (Secure Backend Logic)
//     // req.user is populated by the verifyToken middleware
//     const userRole = req.user.role; // e.g., 'admin' or 'employee'
//     const userId = req.user.userId;

//     if (userRole === 'admin') {
//       // ✅ ADMIN CASE: Do nothing to the query. 
//       // Admins are allowed to see ALL records for that month.
//       console.log("Admin requesting full attendance data.");
//     } else {
//       // ✅ EMPLOYEE CASE: Restrict the query.
//       // 1. Find the Employee profile linked to this User ID
//       const employeeProfile = await Employee.findOne({ userId: userId });

//       if (!employeeProfile) {
//         return res.status(404).json({ message: "No employee profile found for this user." });
//       }

//       // 2. Force the query to filter ONLY by this employee's ID
//       // This prevents an employee from seeing anyone else's data.
//       query.employeeId = employeeProfile.employeeId;
//     }

//     // 3. Execute Query
//     const records = await Attendance.find(query.employeeId ? query : { month: query.month, year: query.year });
//     res.status(200).json(records);
//     // res.json(records.attendance);

//   } catch (error) {
//     console.error("Error fetching attendance:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

const Attendance = require('../model/attendanceModel');
const Employee = require('../model/employeeModel');
const Holiday = require('../model/holiday');
const LeaveRequest = require('../model/leaveRequest');

// const createAttendance = async (req, res) => {
//   try {
//     const { attendanceData } = req.body;
//     if (!attendanceData || !Array.isArray(attendanceData)) {
//       return res.status(400).json({ message: "Invalid data format" });
//     }
//     // Optional: remove old month’s data before inserting new
//     await Attendance.deleteMany({ month: "October-2025" });

//     await Attendance.insertMany(attendanceData);
//     res.status(201).json({ message: "Attendance uploaded successfully" });
//   } catch (error) {
//     console.error("Error uploading attendance:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };


// module.exports = {createAttendance};

// ✅ CommonJS version (test.js) - Refined for MongoDB Schema
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

exports.uploadAttendance = async (req, res) => {
  try {
    console.log("Upload request received");
    console.log("File:", req.file);
    console.log("Body:", req.body);

    const file = req.file;
    const { month, year } = req.body;

    if (!file || !month || !year) {
      console.error("Missing required fields - File:", !!file, "Month:", month, "Year:", year);
      return res.status(400).json({ error: "File, month, and year are required." });
    }

    const FILE_PATH = file.path; // Use the uploaded file path
    const TARGET_YEAR = parseInt(year);
    const TARGET_MONTH = parseInt(month);

    console.log(`Processing attendance for ${TARGET_MONTH}/${TARGET_YEAR}`);

    // Fetch holidays for the year
    const holidays = await Holiday.find({ year: TARGET_YEAR });
    console.log(`Found ${holidays.length} holidays for ${TARGET_YEAR}`);

    // Helper function to check if a date is a holiday
    function isHoliday(date, holidays) {
      return holidays.some(h => date >= new Date(h.fromDate) && date <= new Date(h.toDate));
    }

    // Read workbook
    console.log("Reading Excel file...");
    const workbook = XLSX.readFile(FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to array of arrays
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`Excel file has ${rawData.length} rows`);

    // Skip the top 4 rows (titles + weekday row) to get to the header (days)
    const headerRow = rawData[2];
    const dataRows = rawData.slice(4);

    // Clean headers (Get day numbers 1, 2, 3...)
    const headers = headerRow.map((h) => (h ? h.toString().trim() : ""));

    // --- Helper Functions ---
    function parseTime(t) {
      if (!t) return null;
      const [h, m] = t.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }

    // Calculates duration using only first & last time
    function calculateHoursFirstLast(times) {
      if (!times || times.length < 2) return 0;

      const start = parseTime(times[0]);
      const end = parseTime(times[times.length - 1]);

      // Calculate difference in hours
      const diff = (end - start) / (1000 * 60 * 60);

      // Return positive value or 0 if invalid (e.g. overnight shifts not handled here)
      return diff > 0 && diff < 24 ? +diff.toFixed(2) : 0;
    }

    // --- Build employee records ---
    // Prepare lists
    const STANDARD_WORK_HOURS = 8;
    const employees = [];
    const missingEmployees = [];

    console.log("Processing employee data...");
    // Use Promise.all for DB lookups
    const invalidRows = [];

    await Promise.all(
      dataRows
        .filter((r) => r[0] && r[1])
        .map(async (row) => {
          const employeeIdRaw = row[0]?.toString().trim();
          const employeeId = parseInt(employeeIdRaw);
          const name = row[1]?.toString().trim();

          // Validate that employeeId is a valid number
          if (isNaN(employeeId) || employeeId <= 0) {
            console.warn(`Invalid employee ID: "${employeeIdRaw}" for ${name}`);
            invalidRows.push({ employeeId: employeeIdRaw, name, reason: 'Invalid employee ID format' });
            return;
          }

          // Check if employee exists in DB
          const dbEmployee = await Employee.findOne({ employeeId });
          if (dbEmployee) {
            // Build attendance record
            const emp = {
              employeeId,
              name,
              month: TARGET_MONTH,
              year: TARGET_YEAR,
              totalMonthlyHours: 0,
              totalMonthlyOvertime: 0,
              attendance: [],
              dbData: dbEmployee // Add full DB data if needed
            };
            for (let i = 2; i < headers.length; i++) {
              const dayRaw = headers[i];
              if (!dayRaw || !/^\d+$/.test(dayRaw)) continue;
              const dayNum = parseInt(dayRaw, 10);
              const cell = row[i];
              const date = new Date(TARGET_YEAR, TARGET_MONTH - 1, dayNum);
              let dayRecord = {
                day: dayNum,
                status: "Absent",
                inTime: null,
                outTime: null,
                totalHours: 0,
                overtime: 0,
                times: []
              };

              // Check if the day is a holiday
              if (isHoliday(date, holidays)) {
                dayRecord.status = "Holiday";
                dayRecord.totalHours = 0;
                dayRecord.overtime = 0;
              } else if (typeof cell === "string" && cell.trim() !== "") {
                const times = cell.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
                const totalHours = calculateHoursFirstLast(times);
                let overtimeHours = 0;
                if (totalHours > STANDARD_WORK_HOURS)
                  overtimeHours += (totalHours - STANDARD_WORK_HOURS);

                // Ensure overtime is a number with 2 decimals
                overtimeHours = +overtimeHours.toFixed(2);

                dayRecord.times = times;
                dayRecord.inTime = times[0] || null;
                dayRecord.outTime = times[times.length - 1] || null;
                dayRecord.totalHours = totalHours;
                dayRecord.overtime = overtimeHours;

                if (totalHours > 0) {
                  dayRecord.status = "Present";
                } else if (times.length === 1) {
                  dayRecord.status = "Missed Punch";
                }
                emp.totalMonthlyHours += totalHours;
                emp.totalMonthlyOvertime += overtimeHours;
              }
              emp.attendance.push(dayRecord);
            }
            emp.totalMonthlyHours = +emp.totalMonthlyHours.toFixed(2);
            emp.totalMonthlyOvertime = +emp.totalMonthlyOvertime.toFixed(2);


            employees.push(emp);
          } else {
            missingEmployees.push({ employeeId, name });
          }
        })
    );

    console.log(`Processed ${employees.length} employees, ${missingEmployees.length} missing from DB, ${invalidRows.length} invalid rows`);

    // Save found employees to database
    if (employees.length > 0) {
      console.log("Saving to database...");
      await Attendance.insertMany(employees);
      console.log("Successfully saved to database");
    }

    // If you want to keep the uploaded file, do not delete it
    // fs.unlinkSync(FILE_PATH); // <-- Commented out to keep file

    res.status(201).json({
      message: "Attendance uploaded successfully",
      count: employees.length,
      missingEmployees,
      invalidRows
    });
  } catch (error) {
    console.error("Error uploading attendance:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: "Server error",
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


exports.getAttendance = async (req, res) => {
  try {
    const { month, year, search } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and Year are required." });
    }

    const targetMonth = parseInt(month);
    const targetYear = parseInt(year);

    // 1. Base Query: Always filter by the requested date
    let query = {
      month: targetMonth,
      year: targetYear
    };

    // Add search filter if provided
    if (search && search.trim()) {
      const searchVal = search.trim();
      const numericSearch = parseInt(searchVal);

      if (!isNaN(numericSearch)) {
        query.$or = [
          { name: { $regex: searchVal, $options: 'i' } },
          { employeeId: numericSearch }
        ];
      } else {
        query.$or = [
          { name: { $regex: searchVal, $options: 'i' } }
        ];
      }
      console.log("Search query applied:", query);
    }

    // req.user is populated by the verifyToken middleware
    const userRole = req.user.role; // e.g., 'admin' or 'employee'
    const userId = req.user.userId;

    if (userRole === 'admin') {
      // ✅ ADMIN CASE: Do nothing to the query. 
      // Admins are allowed to see ALL records for that month.
      console.log("Admin requesting full attendance data.");
    } else {
      // ✅ EMPLOYEE CASE: Restrict the query.
      // 1. Find the Employee profile linked to this User ID
      console.log("Fetching profile for userId:", userId);
      const employeeProfile = await Employee.findOne({ userId: userId });

      if (!employeeProfile) {
        return res.status(404).json({ message: "No employee profile found for this user." });
      }

      // 2. Force the query to filter ONLY by this employee's ID
      // This prevents an employee from seeing anyone else's data.
      query.employeeId = employeeProfile.employeeId;
    }

    // 3. Execute Query with .lean() to get plain JS objects
    const records = await Attendance.find(query).lean();

    // 4. Fetch Holidays
    const holidays = await Holiday.find({ year: targetYear }).lean();

    // 5. Fetch Approved Leaves
    // Get all employee IDs from the fetched records
    const employeeIds = records.map(r => r.employeeId);

    // Find Employee Objects (to map str ID to _id) if needed for LeaveRequest
    const employees = await Employee.find({ employeeId: { $in: employeeIds } }).select('employeeId _id').lean();
    const empStrIdToObjIdMap = {};
    employees.forEach(e => {
      empStrIdToObjIdMap[e.employeeId] = e._id;
    });
    const empObjIds = employees.map(e => e._id);

    // Date range for the month
    const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
    const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const leaves = await LeaveRequest.find({
      employeeId: { $in: empObjIds },
      status: 'Approved',
      $or: [
        { fromDate: { $lte: endOfMonth }, toDate: { $gte: startOfMonth } }
      ]
    }).lean();

    // Helper: Check if date is in range (ignoring time)
    const isDateInRange = (date, start, end) => {
      const d = new Date(date).setHours(0, 0, 0, 0);
      const s = new Date(start).setHours(0, 0, 0, 0);
      const e = new Date(end).setHours(0, 0, 0, 0);
      return d >= s && d <= e;
    };

    // 6. Merge Data into Records
    records.forEach(record => {
      const empObjId = empStrIdToObjIdMap[record.employeeId];
      // Filter leaves for this employee
      const empLeaves = leaves.filter(l => l.employeeId.toString() === empObjId?.toString());

      if (record.attendance && Array.isArray(record.attendance)) {
        record.attendance.forEach(dayRecord => {
          const date = new Date(targetYear, targetMonth - 1, dayRecord.day);

          // Priority 1: Holiday
          const matchedHoliday = holidays.find(h => isDateInRange(date, h.fromDate, h.toDate));
          if (matchedHoliday) {
            dayRecord.status = 'Holiday';
            dayRecord.holidayName = matchedHoliday.name || 'Public Holiday';
          } else {
            // Priority 2: Leave (only if not a holiday)
            // Fix: Check for specific leave type (Site Visit)
            const matchedLeave = empLeaves.find(l => isDateInRange(date, l.fromDate, l.toDate));

            if (matchedLeave) {
              if (matchedLeave.leaveReasonType && matchedLeave.leaveReasonType.toLowerCase() === 'sitevisit') {
                dayRecord.status = 'Site Visit';
                dayRecord.leaveType = matchedLeave.leaveReasonType; // Ensure frontend gets this
              } else {
                dayRecord.status = 'Leave';
                dayRecord.leaveType = matchedLeave.leaveType;
              }
            }
          }
        });
      }
    });

    res.status(200).json(records);

  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ error: "Server error fetching attendance." });
  }
};

exports.deleteAttendanceByMonth = async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and Year are required." });
    }

    const targetMonth = parseInt(month);
    const targetYear = parseInt(year);

    const result = await Attendance.deleteMany({ month: targetMonth, year: targetYear });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "No records found to store for this month." });
    }

    res.status(200).json({ message: `Successfully deleted ${result.deletedCount} records for ${month}-${year}.` });

  } catch (error) {
    console.error("Error deleting attendance:", error);
    res.status(500).json({ message: "Server error" });
  }
};