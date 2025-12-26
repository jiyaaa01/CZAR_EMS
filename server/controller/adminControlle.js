const bcrypt = require("bcryptjs");
const User = require("../model/userModel");
const Employee = require("../model/employeeModel");
const LeaveRequest = require("../model/leaveRequest");
const Attendance = require("../model/attendanceModel");
const { sendEmail } = require("../utils/emailService");
const Admin = require('../model/adminModel')

// Utility: Ensure only admins can access
async function ensureAdmin(req, res) {
  // 1. Check Employee collection (legacy admin check)
  let admin = await Employee.findOne({ userId: req.user.userId });
  if (admin && admin.role === "Admin") return true;

  // 2. Check Admin collection (migrated admins)
  admin = await Admin.findOne({ userId: req.user.userId });
  if (admin && (admin.role === "admin" || admin.role === "superadmin")) return true;

  res.status(403).json({ message: "Access denied — Admins only" });
  return false;
}

// ✅ Admin: Get employee by ID
exports.getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).select("-workPassword");
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.status(200).json({ employee });
  } catch (error) {
    console.error("Get Employee By ID Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin: Get all employees with calculated leave balance
exports.getAllEmployees = async (req, res) => {
  try {
    const { search } = req.query;
    let matchQuery = {};

    if (search && search.trim()) {
      const searchVal = search.trim();
      const numericSearch = parseInt(searchVal);

      const orConditions = [
        { name: { $regex: searchVal, $options: 'i' } },
        { workEmail: { $regex: searchVal, $options: 'i' } }
      ];

      if (!isNaN(numericSearch)) {
        orConditions.push({ employeeId: numericSearch });
      }

      matchQuery.$or = orConditions;
    }

    const employees = await Employee.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "leaverequests", // MongoDB collection name for LeaveRequest
          let: { empId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$employeeId", "$$empId"] },
                    { $eq: ["$status", "Approved"] },
                    {
                      $not: {
                        $eq: [{ $toLower: { $ifNull: ["$leaveReasonType", ""] } }, "sitevisit"]
                      }
                    }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalApprovedDays: { $sum: { $ifNull: ["$days", 0] } }
              }
            }
          ],
          as: "leaveStats"
        }
      },
      {
        $addFields: {
          approvedLeaveDays: { $ifNull: [{ $arrayElemAt: ["$leaveStats.totalApprovedDays", 0] }, 0] }
        }
      },
      {
        $addFields: {
          availableLeaveBalance: {
            $subtract: [
              { $ifNull: ["$allocatedLeaves", 20] },
              "$approvedLeaveDays"
            ]
          }
        }
      },
      {
        $project: {
          workPassword: 0,
          leaveStats: 0
        }
      }
    ]);

    res.status(200).json({ employees });
  } catch (error) {
    console.error("Get Users Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin: Create employee (with optional admin role)
exports.createEmployee = async (req, res) => {
  try {
    const {
      name,
      personalEmail,
      phone,
      dateOfBirth,
      dateOfJoining,
      department,
      position,
      employeeId,
      role = "Employee",
      workEmail: manualWorkEmail, // Rename incoming field to manualWorkEmail to avoid ambiguity
    } = req.body;

    // Get uploaded file path (from Multer middleware)
    const profilephoto = req.file ? req.file.filename : null;

    // Validate required fields
    if (!name || !phone || !personalEmail || !manualWorkEmail || !dateOfBirth || !dateOfJoining || !department) {
      return res.status(400).json({ message: "Name, phone, personal & work email, DOB, joining date, and department are required" });
    }

    // Check if work email already exists check in User collection
    if (await User.findOne({ email: manualWorkEmail.toLowerCase() })) {
      return res.status(400).json({ message: "Work email already exists" });
    }

    // Parse employeeId as Number
    const numericEmployeeId = parseInt(employeeId);
    if (isNaN(numericEmployeeId)) {
      return res.status(400).json({ message: "Employee ID must be a number" });
    }

    const dob = new Date(dateOfBirth);
    const day = String(dob.getDate()).padStart(2, "0");
    const month = String(dob.getMonth() + 1).padStart(2, "0");
    const year = dob.getFullYear();
    const workPassword = `${day}${month}${year}`;

    const hashedPassword = await bcrypt.hash(workPassword, 12);

    // Create User
    const user = await new User({
      name,
      email: manualWorkEmail,
      password: hashedPassword,
      role: role.toLowerCase(),
    }).save();

    // 🔀 SPLIT LOGIC: Check if admin or employee
    if (role.toLowerCase() === "admin") {
      // Create ADMIN in admins collection
      const admin = await new Admin({
        userId: user._id,
        name,
        email: manualWorkEmail,
        password: hashedPassword,
        role: "admin",
        phone,
        department,
        isActive: true,
        profilePhoto: profilephoto,
      }).save();

      return res.status(201).json({
        message: "Admin created successfully",
        admin,
      });
    }

    // Create EMPLOYEE in employees collection
    if (!position || !employeeId) {
      return res.status(400).json({ message: "Position and Employee ID are required for employees" });
    }

    // Check for existing Employee ID or Email
    const existingEmployee = await Employee.findOne({
      $or: [{ employeeId: numericEmployeeId }, { personalEmail }],
    });
    if (existingEmployee) {
      return res.status(400).json({ message: "Employee with this ID or email already exists" });
    }

    const employee = await new Employee({
      employeeId: numericEmployeeId,
      name,
      phone,
      personalEmail,
      workEmail: manualWorkEmail,
      dateOfBirth,
      dateOfJoining,
      department,
      position,
      workPassword,
      availableLeaves: 20,
      role: "Employee",
      userId: user._id,
      profilePhoto: profilephoto,
    }).save();

    res.status(201).json({
      message: "Employee created successfully",
      employee,
    });
  } catch (error) {
    console.error("Create Employee Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


exports.getAdminDetails = async (req, res) => {
  try {
    const userId = req.query.id;

    console.log("Fetching admin for userId:", userId);

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Find admin by userId (link to User collection)
    const admin = await Admin.findOne({ userId }).select("-password");
    console.log("Admin found:", admin);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json({
      message: "Admin details fetched successfully",
      admin,
    });
  } catch (error) {
    console.error("Error fetching admin details:", error);
    res.status(500).json({ message: "Server error fetching admin details" });
  }
};


// ✅ Admin: Update employee details
exports.updateEmployee = async (req, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;

    const {
      name,
      phone,
      personalEmail,
      dateOfBirth,
      dateOfJoining,
      allocatedLeaves,
      department,
      position,
      role,
    } = req.body;

    // Prepare update data
    const updateData = {
      name,
      phone,
      personalEmail,
      dateOfBirth,
      dateOfJoining,
      allocatedLeaves,
      department,
      position,
      role,
      updatedAt: new Date(),
    };

    // Handle profile photo upload if provided
    if (req.file) {
      const fs = require('fs');
      const path = require('path');

      // Get the employee first to check for existing photo
      const existingEmployee = await Employee.findOne({ employeeId: req.params.employeeId });

      // Delete old profile photo if exists
      if (existingEmployee && existingEmployee.profilePhoto) {
        const oldPhotoPath = path.join(__dirname, '../../uploads/', existingEmployee.profilePhoto);
        if (fs.existsSync(oldPhotoPath)) {
          try {
            fs.unlinkSync(oldPhotoPath);
          } catch (err) {
            console.error('Error deleting old profile photo:', err);
          }
        }
      }

      // Add new profile photo filename to update data
      updateData.profilePhoto = req.file.filename;
    }

    const employee = await Employee.findOneAndUpdate(
      { employeeId: req.params.employeeId },
      updateData,
      { new: true }
    );

    if (!employee)
      return res.status(404).json({ message: "Employee not found" });

    // Update User name and role for consistency
    await User.findByIdAndUpdate(employee.userId, {
      name,
      role: role?.toLowerCase(),
    });

    res.status(200).json({
      message: `${employee.role} updated successfully`,
      employee,
    });
  } catch (error) {
    console.error("Update Employee Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin: Delete employee
exports.deleteEmployee = async (req, res) => {
  try {
    if (!(await ensureAdmin(req, res))) return;

    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee)
      return res.status(404).json({ message: "Employee not found" });

    await User.findByIdAndDelete(employee.userId);
    res.status(200).json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("Delete Employee Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin: Get all leave requests
exports.getLeaveRequests = async (req, res) => {
  try {
    // if (!(await ensureAdmin(req, res))) return;

    const leaveRequests = await LeaveRequest.find()
      .populate({
        path: "employeeId",
        populate: { path: "userId", select: "name" },
        select: "name department employeeId role"
      })
      .select("leaveType leaveReasonType fromDate toDate fromTime toTime days reason status appliedAt reviewedAt reviewedBy")
      .sort({ appliedAt: -1 });

    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Get Leave Requests Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin: Approve or reject leave requests
exports.reviewLeaveRequest = async (req, res) => {
  try {
    // if (!(await ensureAdmin(req, res))) return;

    const { status } = req.body;
    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const leaveRequest = await LeaveRequest.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewedAt: new Date(),
        reviewedBy: req.user.userId,
      },
      { new: true }
    );

    if (!leaveRequest)
      return res.status(404).json({ message: "Leave request not found" });

    // ✅ If approved, decrease available leaves (skip for siteVisit reason)
    if (status === "Approved") {
      const fromDate = new Date(leaveRequest.fromDate);
      const toDate = new Date(leaveRequest.toDate);
      console.log(`Reviewing leave: from=${fromDate}, to=${toDate}`);

      // Calculate number of days (inclusive of both start and end dates)
      const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

      if (isNaN(daysDiff)) {
        console.error("Invalid dates in leave request:", leaveRequest);
        return res.status(400).json({ message: "Invalid leave dates" });
      }

      console.log(`Approving leave for employee ObjectId: ${leaveRequest.employeeId}, daysDiff: ${daysDiff}`);

      let employee = null;
      if (!leaveRequest.leaveReasonType || leaveRequest.leaveReasonType.toLowerCase() !== 'sitevisit') {
        // Update employee's available leaves for non-site visit leaves (allow negative for unpaid)
        employee = await Employee.findByIdAndUpdate(
          leaveRequest.employeeId,
          { $inc: { availableLeaves: -daysDiff } },
          { new: true }
        );

        if (!employee) {
          console.log(`Employee not found for id: ${leaveRequest.employeeId}`);
        } else {
          console.log(`Leave approved for employee ${employee.name}. Days deducted: ${daysDiff}. Remaining leaves: ${employee.availableLeaves}`);
        }
      } else {
        // For site visit, fetch employee without updating leaves
        employee = await Employee.findById(leaveRequest.employeeId);
        if (!employee) {
          console.log(`Employee not found for id: ${leaveRequest.employeeId}`);
        } else {
          console.log(`Site visit approved for employee ${employee.name}. No leave deduction.`);
        }
      }

      if (employee) {
        // Update attendance records for each leave date
        let currentDate = new Date(fromDate);
        while (currentDate <= toDate) {
          const month = currentDate.getMonth() + 1;
          const year = currentDate.getFullYear();
          const day = currentDate.getDate();

          // Find existing attendance record or create new
          let attRecord = await Attendance.findOne({
            employeeId: employee.employeeId,
            month,
            year
          });

          let dailyData;
          if (leaveRequest.leaveReasonType && leaveRequest.leaveReasonType.toLowerCase() === 'sitevisit') {
            dailyData = {
              day,
              date: new Date(currentDate),
              status: "Site Visit",
              inTime: null,
              outTime: null,
              totalHours: 8, // Full day for site visit
              times: [],
              overtime: 0,
              leaveType: "Site Visit"
            };
          } else {
            dailyData = {
              day,
              date: new Date(currentDate),
              status: "Leave",
              inTime: null,
              outTime: null,
              totalHours: 0,
              times: [],
              overtime: 0,
              leaveType: leaveRequest.leaveType || null
            };
          }

          if (!attRecord) {
            // Create new attendance record with this day
            attRecord = new Attendance({
              employeeId: employee.employeeId,
              name: employee.name,
              month,
              year,
              totalMonthlyHours: 0,
              totalMonthlyOvertime: 0,
              attendance: [dailyData]
            });
          } else {
            // Update or add daily record
            const existingDaily = attRecord.attendance.find(d => d.day === day);
            if (existingDaily) {
              // Override existing
              Object.assign(existingDaily, dailyData);
            } else {
              // Add new
              attRecord.attendance.push(dailyData);
            }

            // Recalculate totalMonthlyHours (sum of Present and Site Visit hours)
            attRecord.totalMonthlyHours = attRecord.attendance
              .filter(a => a.status === "Present" || a.status === "Site Visit")
              .reduce((sum, a) => sum + (a.totalHours || 0), 0);
          }

          await attRecord.save();

          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
        }
        console.log("Attendance records updated successfully.");
      }
    }

    // Populate the leaveRequest for response
    const populatedLeaveRequest = await LeaveRequest.findById(leaveRequest._id).populate({
      path: "employeeId",
      populate: { path: "userId", select: "name" },
      select: "name department employeeId availableLeaves"
    });

    res.status(200).json({
      message: `Leave request ${status.toLowerCase()} successfully`,
      leaveRequest: populatedLeaveRequest,
    });
  } catch (error) {
    console.error("Review Leave Error - Details:", {
      message: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body
    });
    res.status(500).json({ message: "Server error", details: error.message });
  }
};


// ✅ GET /api/admin/dashboard
exports.getAdminDashboard = async (req, res) => {
  try {
    // 1️⃣ Total Employees
    const totalEmployees = await Employee.countDocuments();

    // 2️⃣ Today's Date (without time)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 3️⃣ On Leave Today
    const onLeaveToday = await LeaveRequest.countDocuments({
      status: "Approved",
      fromDate: { $lte: todayStr },
      toDate: { $gte: todayStr },
    });

    // 4️⃣ Attendance Summary (Present / Absent)
    const todayAttendance = 9
    const presentCount = 8
    const absentCount = 1

    // 5️⃣ Pending Leave Requests
    const pendingRequests = await LeaveRequest.find({ status: "Pending" })
      .limit(5)
      .populate({
        path: "employeeId",
        populate: { path: "userId", select: "name" },
        select: "name"
      });

    const leaveRequests = pendingRequests.map((r) => ({
      employeeName: r.employeeId?.userId?.name || r.employeeId?.name || "Unknown",
      leaveType: r.leaveType,
      fromDate: r.fromDate,
      toDate: r.toDate,
      status: r.status,
    }));

    // 6️⃣ Upcoming Birthdays (next 7 days including wraparound to next year)
    const employees = await Employee.find({}, "name dateOfBirth");
    const now = new Date();
    const upcomingBirthdays = employees
      .filter((emp) => {
        if (!emp.dateOfBirth) return false;
        const dob = new Date(emp.dateOfBirth);

        // Try birthday in current year
        let upcomingBirthday = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
        let diffDays = Math.ceil((upcomingBirthday - now) / (1000 * 60 * 60 * 24));

        // If birthday already passed this year, check next year
        if (diffDays < 0) {
          upcomingBirthday = new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
          diffDays = Math.ceil((upcomingBirthday - now) / (1000 * 60 * 60 * 24));
        }

        // Return true if birthday is within next 7 days
        return diffDays >= 0 && diffDays <= 7;
      })
      .map((emp) => {
        const dob = new Date(emp.dateOfBirth);
        return {
          name: emp.name,
          date: new Date(emp.dateOfBirth).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
        };
      })
      .sort((a, b) => {
        // Sort by day number to show closest birthdays first
        const aDay = parseInt(a.date.split(" ")[1]);
        const bDay = parseInt(b.date.split(" ")[1]);
        return aDay - bDay;
      });

    // ✅ Response
    res.status(200).json({
      totalEmployees,
      onLeaveToday,
      attendanceSummary: { present: presentCount, absent: absentCount },
      leaveRequests,
      upcomingBirthdays,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard:", error);
    res.status(500).json({ message: "Server error fetching admin dashboard" });
  }
};

// ✅ Admin: Update admin profile
exports.updateAdminProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, department } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Admin ID is required" });
    }

    // Update admin record by _id
    const admin = await Admin.findByIdAndUpdate(
      id,
      { name, phone, department },
      { new: true, runValidators: true }
    ).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json({
      message: "Admin profile updated successfully",
      admin,
    });
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({ message: "Server error updating admin profile" });
  }
};

// ✅ Admin: Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both fields are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password too short (min 6 chars)' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect current password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change Password Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Admin: Update leave balance for a specific employee
exports.updateLeaveBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { availableLeaves } = req.body;

    console.log('Update Leave Balance - Params:', req.params);
    console.log('Update Leave Balance - Body:', req.body);

    if (!id || availableLeaves === undefined) {
      return res.status(400).json({ message: 'Employee ID and availableLeaves are required' });
    }

    const employee = await Employee.findOneAndUpdate(
      { employeeId: id },
      { availableLeaves },
      { new: true }
    );

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.status(200).json({
      message: 'Leave balance updated successfully',
      employee,
    });
  } catch (error) {
    console.error('Update Leave Balance Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Admin: Update employee profile (excluding role)
exports.updateEmployeeProfile = async (req, res) => {
  try {
    // if (!(await ensureAdmin(req, res))) return;

    const {
      name,
      phone,
      personalEmail,
      dateOfBirth,
      dateOfJoining,
      allocatedLeaves,
      department,
      position,
      role,
    } = req.body;

    // Check if role is changing to Admin
    if (role === 'Admin') {
      const currentEmployee = await Employee.findOne({ employeeId: req.params.id });

      if (currentEmployee && currentEmployee.role !== 'Admin') {
        // ✨ MIGRATION LOGIC: Employee -> Admin
        console.log(`Migrating Employee ${currentEmployee.name} to Admin collection...`);

        // 1. Create Admin Record
        const newAdmin = new Admin({
          userId: currentEmployee.userId,
          name: name || currentEmployee.name,
          email: personalEmail || currentEmployee.personalEmail, // Admin uses email (unique), Employee use workEmail/personalEmail. Admin model email is unique. 
          // Note: Admin model typically uses work email or unique email. Let's use workEmail if we want to be safe or personal? 
          // Using workEmail is safer as it's definitely unique in Employee.
          email: currentEmployee.workEmail,
          password: currentEmployee.workPassword, // This triggers pre-save hash in Admin model
          role: 'admin',
          phone: phone || currentEmployee.phone,
          department: department || currentEmployee.department,
          isActive: true
        });

        await newAdmin.save();
        console.log('Admin record created.');

        // 2. Update User role
        await User.findByIdAndUpdate(currentEmployee.userId, {
          role: 'admin',
          name: name || currentEmployee.name
        });

        // 3. Delete Employee Record
        await Employee.findByIdAndDelete(currentEmployee._id);
        console.log('Old Employee record deleted.');

        return res.status(200).json({
          message: "Employee promoted to Admin and migrated successfully",
          employee: newAdmin // Return new admin object structure
        });
      }
    }

    // Normal Update Logic (if not migrating)
    const updateData = {};
    if (name !== undefined && name !== '') updateData.name = name;
    if (phone !== undefined && phone !== '') updateData.phone = phone;
    if (personalEmail !== undefined && personalEmail !== '') updateData.personalEmail = personalEmail;
    if (dateOfBirth !== undefined && dateOfBirth !== '') updateData.dateOfBirth = dateOfBirth;
    if (dateOfJoining !== undefined && dateOfJoining !== '') updateData.dateOfJoining = dateOfJoining;
    if (allocatedLeaves !== undefined && allocatedLeaves !== '') updateData.allocatedLeaves = parseInt(allocatedLeaves);
    if (department !== undefined && department !== '') updateData.department = department;
    if (position !== undefined && position !== '') updateData.position = position;
    if (role !== undefined && role !== '') updateData.role = role;
    updateData.updatedAt = new Date();

    const employee = await Employee.findOneAndUpdate(
      { employeeId: parseInt(req.params.id) },
      updateData,
      { new: true }
    );

    if (!employee)
      return res.status(404).json({ message: "Employee not found" });

    // Update User name for consistency if name was updated
    const userUpdate = {};
    if (name) userUpdate.name = name;
    if (role) userUpdate.role = role.toLowerCase();

    if (Object.keys(userUpdate).length > 0) {
      await User.findByIdAndUpdate(employee.userId, userUpdate);
    }

    res.status(200).json({
      message: "Employee profile updated successfully",
      employee,
    });
  } catch (error) {
    console.error("Update Employee Profile Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin: Update leave balances for all employees
exports.updateAllLeaveBalances = async (req, res) => {
  try {
    const { leaveIncrement } = req.body;

    if (leaveIncrement === undefined) {
      return res.status(400).json({ message: 'leaveIncrement is required' });
    }

    const result = await Employee.updateMany(
      {},
      { $inc: { availableLeaves: leaveIncrement } }
    );

    res.status(200).json({
      message: `Leave balances updated for ${result.modifiedCount} employees`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('Update All Leave Balances Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
