const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../model/userModel');
const Holiday = require('../model/holiday');

require('dotenv').config();

const connectToDB = async () => {
  try {
    // Use Atlas connection string from .env, fallback to local for development
    const mongoUri = (process.env.MONGO_URI);
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
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

module.exports = { createDefaultAdmin, addSampleHolidays, connectToDB };