const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const User = require('../model/userModel');
const Employee = require('../model/employeeModel');
const Admin = require('../model/adminModel')


exports.register = async (req, res) => {
  try {
    const { name, email, password, role, phoneNo, department } = req.body;

    // 🧩 Validation
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "All fields required" });

    if (!validator.isEmail(email))
      return res.status(400).json({ message: "Invalid email" });

    if (password.length < 6)
      return res.status(400).json({ message: "Password too short" });

    if (!["admin", "employee"].includes(role))
      return res.status(400).json({ message: "Invalid role" });

    const existingUser = await User.findOne({ email });
    console.log("Existig user : ", existingUser)

    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await new User({
      name,
      email,
      password: hashedPassword,
      role,
    }).save();

    if (role === "employee") {
      await new Employee({
        employeeId: `EMP${Date.now()}`,
        name,
        personalEmail: email,
        phone: phoneNo,
        workEmail: email,
        dateOfBirth: new Date(),
        dateOfJoining: new Date(),
        availableLeaves: 20,
        department: "General",
        position: "Employee",
        workPassword: password,
        userId: user._id,
      }).save();
    }

    if (role === "admin") {
      await new Admin({
        userId: user._id,
        name,
        email,
        password: hashedPassword,
        role: "admin",
        phone: phoneNo,
        department: department,
        isActive: true,
        lastLogin: null,
      }).save();
    }

    const token = jwt.sign(
      { userId: user._id, email, role },
      process.env.JWT_SECRET || "czarcore_secret_key",
      { expiresIn: "7d" }
    );

    res
      .status(201)
      .json({ message: `${role} registered successfully`, token, user });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    console.log(req.body);


    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id, email, role: user.role }, process.env.JWT_SECRET || 'czarcore_secret_key', { expiresIn: '7d' });

    res.json({ message: 'Login successful', token, user });
  } catch {
    res.status(500).json({ message: 'Server error during login' });
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("req, body : ", req.body);


    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });
    console.log("email password : ", email, password);

    const admin = await Admin.findOne({ email }).select("password name email");
    console.log(admin);

    if (!admin)
      return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, admin.password);


    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password" });

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
      { userId: admin._id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET || "czarcore_secret_key",
      { expiresIn: "24h" }
    );

    res.status(200).json({
      message: "Admin login successful",
      token,
      user: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ message: "Server error during admin login" });
  }
};

