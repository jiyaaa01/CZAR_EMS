const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../model/userModel');
const Holiday = require('../model/holiday');

require('dotenv').config();

const connectToDB = async () => {
    const mongoUri = process.env.MONGO_URI;
    try {
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to local MongoDB successfully');
    } catch (localError) {
      console.error('❌ Local MongoDB connection error:', localError.message);
      console.log('💡 Ensure MongoDB is installed and running locally, or whitelist your IP in Atlas.');
      process.exit(1);
    }
  };
// };

const createDefaultEmployee = async () => {
  const employeeCount = await User.countDocuments({ role: 'employee' });
  if (employeeCount === 0) {
    const hashedPassword = await bcrypt.hash('employee123', 12);
    const user = await new User({
      name: 'Employee User',
      email: 'employee@czarcore.com',
      password: hashedPassword,
      role: 'employee'
    }).save();

    // Also create in Employee model
    const Employee = require('../model/employeeModel');
    await new Employee({
      userId: user._id,
      name: 'Employee User',
      email: 'employee@czarcore.com',
      password: hashedPassword,
      role: 'employee',
      phone: '',
      department: 'HR',
      isActive: true,
    }).save();
    console.log('✅ Default employee created: employee@czarcore.com / employee123');
  }
};

const createDefaultAdmin = async () => {
  const adminCount = await User.countDocuments({ role: 'admin' });
  if (adminCount === 0) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const user = await new User({
      name: 'Admin User',
      email: 'admin@czarcore.com',
      password: hashedPassword,
      role: 'admin'
    }).save();

    // Also create in Admin model
    const Admin = require('../model/adminModel');
    await new Admin({
      userId: user._id,
      name: 'Admin User',
      email: 'admin@czarcore.com',
      password: hashedPassword,
      role: 'admin',
      phone: '',
      department: 'HR',
      isActive: true,
    }).save();

    console.log('✅ Default admin created: admin@czarcore.com / admin123');
  }
};

const addSampleHolidays = async () => {
  const holidayCount = await Holiday.countDocuments();
  if (holidayCount === 0) {
    await Holiday.insertMany([
      { name: 'New Year\'s Day', date: new Date('2024-01-01'), year: 2024 },
      { name: 'Independence Day', date: new Date('2024-08-15'), year: 2024 },
      { name: 'Gandhi Jayanti', date: new Date('2024-10-02'), year: 2024 },
      { name: 'Christmas', date: new Date('2024-12-25'), year: 2024 },
      { name: 'Diwali', date: new Date('2024-11-01'), year: 2024 }
    ]);
    console.log('✅ Sample holidays added');
  }
};


const createDefaultEmployee = async () => {
  const User = require('../model/userModel');
  const Employee = require('../model/employeeModel');

  const empCount = await User.countDocuments({ role: 'employee' });
  if (empCount === 0) {
    const hashedPassword = await bcrypt.hash('employee123', 12);
    const user = await new User({
      name: 'Default Employee',
      email: 'employee@czarcore.com',
      password: hashedPassword,
      role: 'employee'
    }).save();

    await new Employee({
      userId: user._id,
      employeeId: 1,
      name: 'Default Employee',
      personalEmail: 'employee@personal.com',
      workEmail: 'employee@czarcore.com',
      department: 'IT',
      role: 'Employee',
      dateOfJoining: new Date(),
      allocatedLeaves: 20,
      availableLeaves: 20,
      salary: 50000,
      position: 'Software Developer'
    }).save();

    console.log('✅ Default employee created: employee@czarcore.com / employee123');
  }
};

module.exports = { createDefaultAdmin, createDefaultEmployee, addSampleHolidays, connectToDB };