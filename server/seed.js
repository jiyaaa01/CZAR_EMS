require('dotenv').config();

const mongoose = require('mongoose');
const {
    connectToDB,
    createDefaultEmployee,
    createDefaultAdmin,
    addSampleHolidays,
} = require('./config/db.js');

const seedDatabase = async () => {
    try {
        console.log('🌱 Seeding database...');
        await connectToDB();
        console.log('✅ MongoDB connected successfully');
        await createDefaultEmployee();
        await createDefaultAdmin();
        await addSampleHolidays();
        // 'console.log('✅ Database seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedDatabase();
