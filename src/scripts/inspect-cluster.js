require('dotenv').config();
const mongoose = require('mongoose');

async function inspectCluster() {
  try {
    console.log('Connecting to MongoDB Atlas Cluster...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Cluster:', mongoose.connection.host);
    console.log('Database:', mongoose.connection.name);
    console.log('----------------------------------------------------');

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Found ${collections.length} Collections in Database:\n`);

    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`📁 [${col.name.toUpperCase()}] -> ${count} documents`);
    }

    console.log('\n----------------------------------------------------');
    console.log('Sample Recent Records Preview:');

    // Companies
    const companies = await mongoose.connection.db.collection('companies').find().limit(3).toArray();
    console.log('\n🏢 Companies:', companies.map(c => ({ id: c._id, name: c.name, code: c.companyCode, phone: c.phone })));

    // Users
    const users = await mongoose.connection.db.collection('users').find().limit(5).toArray();
    console.log('\n👤 Users / Staff:', users.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role })));

    // Customers
    const customers = await mongoose.connection.db.collection('customers').find().limit(5).toArray();
    console.log('\n👥 Borrowers:', customers.map(c => ({ id: c._id, name: c.name, code: c.customerCode, phone: c.phone })));

    // Payments
    const payments = await mongoose.connection.db.collection('payments').find().sort({ createdAt: -1 }).limit(5).toArray();
    console.log('\n💰 Recent Payments:', payments.map(p => ({ receipt: p.receiptNumber, amount: p.amount, status: p.status, date: p.paymentDate })));

    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (err) {
    console.error('Cluster inspection error:', err.message);
    process.exit(1);
  }
}

inspectCluster();
