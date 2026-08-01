const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin_hacker';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'H@ckTh3G@m3_2024';
const adminSessions = new Map();

// मिडलवेयर (Middleware)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/admin.html') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

const STATIC_ROOT = path.resolve(__dirname);

// स्टैटिक फाइल्स और फ्रंट-एंड पेजेस को लोड करने के लिए
app.use(express.static(STATIC_ROOT, { maxAge: 0 }));
app.get('/', (req, res) => res.redirect('/admin.html'));
app.get('/admin.html', (req, res) => res.sendFile('admin.html', { root: STATIC_ROOT }));
app.get('/admin.dashboard.html', (req, res) => res.sendFile('admin.dashboard.html', { root: STATIC_ROOT }));
app.get('/payment-approval.html', (req, res) => res.sendFile('payment-approval.html', { root: STATIC_ROOT }));
app.get('/admin/approve-payments', (req, res) => res.sendFile('payment-approval.html', { root: STATIC_ROOT }));

// MongoDB कनेक्शन
const MONGO_URI = 'mongodb+srv://admin12340:Rdg04hMPtCxhLmGu@cluster0.ucnyait.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI).then(async () => {
    console.log('MongoDB Connected Successfully');
    await createDefaultAdminUser();
}).catch(err => {
    console.error('Database connection error:', err);
});

// 1. यूजर स्कीमा (User Schema - टीम और इनवाइट कोड जोड़ा गया है)
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    uid: { type: String, required: true, unique: true },
    balance: { type: Number, default: 674.22 },
    invitedBy: { type: String, default: '' }, // किसने इनवाइट किया (स्पॉन्सर का UID)
    username: { type: String, default: '' },
    role: { type: String, default: 'customer' },
    isBlocked: { type: Boolean, default: false },
    banks: [{
        holderName: String,
        accNumber: String,
        bankName: String,
        ifscCode: String,
        isActive: { type: Boolean, default: true }
    }],
    gaSecretKey: { type: String, default: '' },
    isGaBound: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const gatewayMethodSchema = new mongoose.Schema({
    type: { type: String, required: true },
    name: { type: String, required: true },
    accountNumber: { type: String, default: '' },
    holderName: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    bankAccount: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const GatewayMethod = mongoose.model('GatewayMethod', gatewayMethodSchema);

// 2. आर्डर/ट्रांजेक्शन स्कीमा (Order & Token History Schema)
const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    uid: { type: String, required: true },
    userName: { type: String, default: '' },
    type: { type: String, required: true }, 
    amount: { type: String, required: true },
    desc: { type: String, default: '' },
    bankName: { type: String, default: '' },
    accountLast4: { type: String, default: '' },
    utr: { type: String, default: '' },
    proofImage: { type: String, default: '' },
    rejectReason: { type: String, default: '' },
    status: { type: String, default: 'success' },
    category: { type: String, default: '' },
    currency: { type: String, default: '' },
    time: { type: String, required: true }
});

const Order = mongoose.model('Order', orderSchema);

// डिफ़ॉल्ट एडमिन यूजर फंक्शन (UID 20001)
async function createDefaultAdminUser() {
    try {
        const adminPhone = "9862713447";
        let existingAdmin = await User.findOne({ role: 'admin' });

        if (!existingAdmin) {
            existingAdmin = await User.findOne({ phone: adminPhone });
        }

        if (!existingAdmin) {
            const count = await User.countDocuments();
            const nextUidNumber = 20001 + count;

            const defaultAdmin = new User({
                phone: adminPhone,
                password: DEFAULT_ADMIN_PASSWORD,
                uid: nextUidNumber.toString(),
                username: DEFAULT_ADMIN_USERNAME,
                role: 'admin',
                balance: 5000.00,
                invitedBy: 'Admin'
            });

            await defaultAdmin.save();
            console.log(`Default Admin User Created Successfully with UID: ${defaultAdmin.uid} (${adminPhone})`);
        } else {
            existingAdmin.username = DEFAULT_ADMIN_USERNAME;
            existingAdmin.role = 'admin';
            existingAdmin.password = DEFAULT_ADMIN_PASSWORD;
            await existingAdmin.save();
        }

        const gatewayCount = await GatewayMethod.countDocuments();
        if (gatewayCount === 0) {
            await GatewayMethod.insertMany([
                {
                    type: 'bank',
                    name: 'Fino Payment Bank',
                    accountNumber: '20401036509',
                    holderName: 'Noor Bhanu Begum',
                    ifscCode: 'FINO0009001',
                    isActive: true
                },
                {
                    type: 'bank',
                    name: 'Bank Gateway',
                    bankAccount: 'HOLO-DEFAULT-BANK',
                    isActive: true
                }
            ]);
        }
    } catch (error) {
        console.error('Error creating default admin:', error);
    }
}

function buildOrderPayload(payload = {}) {
    const amount = payload.amount || '';
    const status = payload.status || 'success';
    const time = payload.time || new Date().toISOString().replace('T', ' ').substring(0, 19);
    const orderId = payload.orderId || payload.id || `ORD${Math.floor(100000 + Math.random() * 900000)}`;
    const uid = payload.uid || payload.userUid || '';
    const userName = payload.userName || payload.username || payload.name || '';
    const type = payload.type || 'Receive';
    const desc = payload.desc || [
        payload.income ? `Income: ${payload.income}` : '',
        payload.quota ? `Quota: ${payload.quota}` : ''
    ].filter(Boolean).join(' | ') || 'Payment task completed';

    return {
        orderId,
        uid,
        userName,
        type,
        amount,
        desc,
        bankName: payload.bankName || '',
        accountLast4: payload.accountLast4 || '',
        utr: payload.utr || '',
        proofImage: payload.proofImage || '',
        rejectReason: payload.rejectReason || '',
        status,
        category: payload.category || (payload.type === 'INR' || payload.type === 'USDT' ? 'recharge' : ''),
        currency: payload.currency || payload.type || '',
        time
    };
}

async function saveOrderRecord(orderPayload) {
    const orderId = orderPayload.orderId;
    if (!orderId) {
        return null;
    }

    const existingOrder = await Order.findOne({ orderId });
    if (existingOrder) {
        Object.assign(existingOrder, orderPayload);
        await existingOrder.save();
        return existingOrder;
    }

    const newOrder = new Order(orderPayload);
    await newOrder.save();
    return newOrder;
}

function adminAuth(req, res, next) {
    const token = req.headers.authorization?.split('Bearer ')[1] || req.headers['x-admin-token'];
    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized admin access' });
    }

    req.admin = adminSessions.get(token);
    next();
}

// --- API ROUTES ---

// A. रजिस्ट्रेशन एपीआई (Register API - इनवाइट कोड सेव करने के साथ)
app.post('/api/register', async (req, res) => {
    try {
        const { phone, password, inviteCode } = req.body;
        
        let existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Phone number already registered!' });
        }

        const totalUsers = await User.countDocuments();
        const nextUid = (20001 + totalUsers).toString();
        
        const newUser = new User({
            phone,
            password,
            uid: nextUid,
            invitedBy: inviteCode || '20001' // यहाँ इनवाइट करने वाले का UID सेव होगा
        });

        await newUser.save();
        res.status(201).json({ success: true, message: 'Registration successful!', uid: nextUid });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// B. लॉगिन एपीआई (Login API)
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        const user = await User.findOne({ phone, password });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid phone number or password!' });
        }

        if (user.isBlocked) {
            return res.status(403).json({ success: false, message: 'Your account is blocked. Contact support.' });
        }

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            uid: user.uid,
            phone: user.phone,
            balance: user.balance
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        const normalizedUsername = (username || '').trim().toLowerCase();
        const normalizedPassword = (password || '').trim();

        const hardcodedMatch = normalizedUsername === DEFAULT_ADMIN_USERNAME.toLowerCase() && normalizedPassword === DEFAULT_ADMIN_PASSWORD;

        let loginUser = null;
        try {
            loginUser = await User.findOne({
                role: 'admin',
                $or: [
                    { username: { $regex: new RegExp(`^${normalizedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                    { phone: normalizedUsername }
                ]
            });
        } catch (dbError) {
            loginUser = null;
        }

        const dbMatch = Boolean(loginUser && loginUser.password === normalizedPassword);
        if (!hardcodedMatch && !dbMatch) {
            return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
        }

        const token = crypto.randomBytes(24).toString('hex');
        adminSessions.set(token, {
            uid: loginUser?.uid || '20001',
            phone: loginUser?.phone || '9862713447',
            username: loginUser?.username || DEFAULT_ADMIN_USERNAME
        });

        res.status(200).json({
            success: true,
            message: 'Admin login successful',
            token,
            admin: {
                uid: loginUser?.uid || '20001',
                phone: loginUser?.phone || '9862713447',
                username: loginUser?.username || DEFAULT_ADMIN_USERNAME
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/health', (req, res) => {
    res.status(200).json({ success: true, message: 'Admin API is healthy' });
});

app.get('/api/admin/me', adminAuth, async (req, res) => {
    res.status(200).json({ success: true, admin: req.admin });
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const query = search ? {
            $or: [
                { uid: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') },
                { 'banks.accNumber': new RegExp(search, 'i') }
            ]
        } : {};

        const users = await User.find(query).select('uid phone balance isBlocked role createdAt banks').sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/users/:uid/status', adminAuth, async (req, res) => {
    try {
        const { uid } = req.params;
        const { isBlocked } = req.body;
        const user = await User.findOne({ uid });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.isBlocked = Boolean(isBlocked);
        await user.save();
        res.status(200).json({ success: true, message: 'User status updated', data: user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/users/:uid/password', adminAuth, async (req, res) => {
    try {
        const { uid } = req.params;
        const { password } = req.body;
        const user = await User.findOne({ uid });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.password = password;
        await user.save();
        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/transfer-balance', adminAuth, async (req, res) => {
    try {
        const { fromUid, toUid, amount } = req.body;
        const transferAmount = parseFloat(amount);

        if (!fromUid || !toUid || !transferAmount || transferAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid transfer details' });
        }

        const source = await User.findOne({ uid: fromUid });
        const target = await User.findOne({ uid: toUid });

        if (!source || !target) {
            return res.status(404).json({ success: false, message: 'Source or target user not found' });
        }

        if (source.balance < transferAmount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }

        source.balance = Number(source.balance) - transferAmount;
        target.balance = Number(target.balance) + transferAmount;
        await source.save();
        await target.save();

        res.status(200).json({ success: true, message: 'Balance transferred successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/orders', adminAuth, async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const status = (req.query.status || '').trim();
        const category = req.query.category || '';
        const query = {};

        if (status) {
            query.status = status;
        }

        if (category) {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { orderId: new RegExp(search, 'i') },
                { utr: new RegExp(search, 'i') },
                { uid: new RegExp(search, 'i') },
                { userName: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') }
            ];
        }

        const orders = await Order.find(query).sort({ _id: -1 });
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.patch('/api/admin/orders/:orderId/status', adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, utr, rejectReason } = req.body;
        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const previousStatus = order.status;
        if (utr !== undefined) {
            order.utr = utr;
        }
        if (rejectReason !== undefined) {
            order.rejectReason = rejectReason;
        }
        if (status) {
            order.status = status;
        }

        await order.save();

        if (status === 'approved' && previousStatus !== 'approved') {
            const numericAmount = parseFloat(String(order.amount).replace(/[^0-9.-]+/g, '')) || 0;
            if (numericAmount !== 0) {
                await User.findOneAndUpdate({ uid: order.uid }, { $inc: { balance: numericAmount } });
            }
        }

        res.status(200).json({ success: true, message: 'Order status updated', data: order });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/public/orders', async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const status = (req.query.status || '').trim();
        const category = req.query.category || '';
        const query = {};

        if (status) {
            query.status = status;
        }

        if (category) {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { orderId: new RegExp(search, 'i') },
                { utr: new RegExp(search, 'i') },
                { uid: new RegExp(search, 'i') },
                { userName: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') }
            ];
        }

        const orders = await Order.find(query).sort({ _id: -1 });
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.patch('/api/public/orders/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, utr, rejectReason } = req.body;
        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const previousStatus = order.status;
        if (utr !== undefined) {
            order.utr = utr;
        }
        if (rejectReason !== undefined) {
            order.rejectReason = rejectReason;
        }
        if (status) {
            order.status = status;
        }

        await order.save();

        if (status === 'approved' && previousStatus !== 'approved') {
            const numericAmount = parseFloat(String(order.amount).replace(/[^0-9.-]+/g, '')) || 0;
            if (numericAmount !== 0) {
                await User.findOneAndUpdate({ uid: order.uid }, { $inc: { balance: numericAmount } });
            }
        }

        res.status(200).json({ success: true, message: 'Order status updated', data: order });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/history', adminAuth, async (req, res) => {
    try {
        const history = await Order.find({ category: 'recharge' }).sort({ _id: -1 });
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/token-history', adminAuth, async (req, res) => {
    try {
        const history = await Order.find({ category: 'token' }).sort({ _id: -1 });
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/bank-methods', adminAuth, async (req, res) => {
    try {
        const methods = await GatewayMethod.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: methods });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/bank-methods', adminAuth, async (req, res) => {
    try {
        const method = new GatewayMethod(req.body);
        await method.save();
        res.status(201).json({ success: true, data: method });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/bank-methods/:id', adminAuth, async (req, res) => {
    try {
        const method = await GatewayMethod.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!method) {
            return res.status(404).json({ success: false, message: 'Bank method not found' });
        }
        res.status(200).json({ success: true, data: method });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/bank-methods/:id', adminAuth, async (req, res) => {
    try {
        const method = await GatewayMethod.findByIdAndDelete(req.params.id);
        if (!method) {
            return res.status(404).json({ success: false, message: 'Bank method not found' });
        }
        res.status(200).json({ success: true, message: 'Bank method deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/gateway-methods', adminAuth, async (req, res) => {
    return res.status(200).json({ success: true, data: await GatewayMethod.find().sort({ createdAt: -1 }) });
});

app.post('/api/admin/gateway-methods', adminAuth, async (req, res) => {
    return res.status(201).json({ success: true, data: await new GatewayMethod(req.body).save() });
});

app.put('/api/admin/gateway-methods/:id', adminAuth, async (req, res) => {
    const method = await GatewayMethod.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!method) {
        return res.status(404).json({ success: false, message: 'Bank method not found' });
    }
    return res.status(200).json({ success: true, data: method });
});

app.delete('/api/admin/gateway-methods/:id', adminAuth, async (req, res) => {
    const method = await GatewayMethod.findByIdAndDelete(req.params.id);
    if (!method) {
        return res.status(404).json({ success: false, message: 'Bank method not found' });
    }
    return res.status(200).json({ success: true, message: 'Bank method deleted' });
});

// C. बैंक अकाउंट सेव करने की एपीआई (Bank Management API)
app.post('/api/bank/save', async (req, res) => {
    try {
        const { phone, bankDetails } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found!' });
        }

        user.banks.push(bankDetails);
        await user.save();

        res.status(200).json({ success: true, message: 'Bank details saved successfully!', banks: user.banks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// D. गूगल ऑथेंटिकेटर बाइंड करने की एपीआई (Google Authenticator API)
app.post('/api/auth/bind-ga', async (req, res) => {
    try {
        const { phone, secretKey } = req.body;

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found!' });
        }

        user.gaSecretKey = secretKey;
        user.isGaBound = true;
        await user.save();

        res.status(200).json({ success: true, message: 'Google Authenticator bound successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// E. टास्क / रीचार्ज / आर्डर सबमिट करने की एपीआई (Task & Recharge History API)
app.post('/api/create-order', async (req, res) => {
    try {
        const orderPayload = buildOrderPayload(req.body);
        const savedOrder = await saveOrderRecord(orderPayload);

        res.status(200).json({ success: true, message: 'Order created successfully!', data: savedOrder });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/order/submit', async (req, res) => {
    try {
        const orderPayload = buildOrderPayload(req.body);
        const savedOrder = await saveOrderRecord(orderPayload);

        if (orderPayload.status === 'success') {
            const numericAmount = parseFloat(orderPayload.amount.replace(/[^0-9.-]+/g, '')) || 0;
            if (numericAmount !== 0) {
                await User.findOneAndUpdate({ uid: orderPayload.uid }, { $inc: { balance: numericAmount } });
            }
        }

        res.status(200).json({ success: true, message: 'Task submitted and history updated successfully!', data: savedOrder });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/token/log', async (req, res) => {
    try {
        const tokenPayload = buildOrderPayload({
            ...req.body,
            category: 'token',
            type: req.body.type || 'Receive',
            status: req.body.status || 'success',
            desc: req.body.desc || 'Token transaction logged'
        });
        const savedOrder = await saveOrderRecord(tokenPayload);

        res.status(200).json({ success: true, message: 'Token history updated successfully!', data: savedOrder });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// F. टोकन हिस्ट्री / रीचार्ज हिस्ट्री फेच करने की एपीआई (Fetch History API)
app.get('/api/history/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const historyList = await Order.find({ uid }).sort({ _id: -1 });
        res.status(200).json({ success: true, data: historyList });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// G. टीम के सदस्यों को फेच करने की नई एपीआई (Fetch Team Members API)
app.get('/api/team/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        // डेटाबेस में से उन यूजर्स को ढूंढो जिनका invitedBy इस UID से मैच करता है
        const teamMembers = await User.find({ invitedBy: uid }).select('uid phone balance createdAt -_id');
        res.status(200).json({ success: true, count: teamMembers.length, data: teamMembers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// सर्वर स्टार्ट करना
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});